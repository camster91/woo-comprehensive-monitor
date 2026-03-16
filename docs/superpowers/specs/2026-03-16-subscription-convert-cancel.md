# Subscription Cancel & Convert to One-Time

## Goal

Give customers a better cancellation experience and the option to convert their subscription to a one-time purchase, charging the difference between their promotional subscription rate and the regular retail price.

## User Flow

### Cancel Subscription
1. Customer goes to My Account → Subscriptions → View Subscription
2. Clicks "Cancel Subscription"
3. Sees confirmation modal: "Are you sure? You'll lose your subscription discount."
4. Option to convert to one-time instead (retention offer)
5. Confirms → subscription cancelled, logged to monitoring dashboard

### Convert to One-Time Order
1. Customer goes to My Account → Subscriptions → View Subscription
2. Sees "Switch to One-Time Purchase" button (only visible within 30 days of next renewal)
3. Clicks → sees breakdown:
   - "Your subscription price: $34.17"
   - "Regular one-time price: $49.99"
   - "Difference to pay now: $15.82"
4. Confirms → Stripe charges the difference to their card on file
5. Subscription cancelled immediately
6. Order note added, event sent to monitoring dashboard

## Pricing Logic

- Subscription price = `_subscrpt_price` meta on the subscription
- Regular price = product's `get_regular_price()` (the non-subscription/non-sale price)
- Difference = regular_price - subscription_price
- If difference <= 0 (subscription costs more than regular), no charge needed
- Charge is made via Stripe using the customer's saved payment method

## Availability Window

- "Convert to One-Time" button only shows when the next renewal date (`_subscrpt_next_date`) is within 30 days
- If next renewal is more than 30 days away, button is hidden
- If subscription is not active, buttons are hidden
- Cancel is always available for active subscriptions

## Technical Implementation

### Plugin Side (WCM)
New class: `WCM_Subscription_Convert`

**Hooks into WPSubscription's My Account page:**
- Filter `subscrpt_single_action_buttons` to add "Convert to One-Time" and improve "Cancel" buttons
- AJAX handler for the conversion (charge Stripe, cancel subscription)
- AJAX handler for cancel with confirmation

**Stripe charge for price difference:**
- Get customer's Stripe customer ID from the original order's payment method
- Create a one-time charge via Stripe API for the difference amount
- Use the customer's saved card (payment method on file)

**Events sent to monitoring server:**
- `subscription_converted` — customer, order, subscription price, regular price, difference charged
- `subscription_cancelled` — customer, order, reason (manual cancel vs expired)

### Data Flow
```
Customer clicks "Convert to One-Time"
  → AJAX to WordPress
  → WCM_Subscription_Convert::handle_convert()
    → Calculate price difference (regular - subscription)
    → Charge Stripe (saved payment method)
    → Cancel subscription (set status to cancelled)
    → Create WooCommerce order for the difference charge
    → Add order note to original order
    → Send event to monitoring server
  → Return success/error to customer
```

## What Gets Stored

On the WooCommerce order (order note):
- "Subscription #X converted to one-time purchase. Price difference of $X.XX charged."

On the monitoring server (via tracking endpoint):
- type: subscription_converted
- store_name, customer_name, customer_email
- subscription_id, order_id
- subscription_price, regular_price, difference_charged
- timestamp

## Edge Cases

- Customer has no saved payment method → show error, suggest adding card first
- Stripe charge fails → don't cancel subscription, show error
- Product has been deleted → use the price stored on the subscription
- Regular price equals or is less than subscription price → convert for free (no charge)
- Subscription already in pe_cancelled state → don't show convert option
