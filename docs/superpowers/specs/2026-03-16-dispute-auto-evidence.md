# Phase 2: Dispute Auto-Evidence & Submission

## Goal

When a Stripe dispute is detected, automatically gather all available evidence from WooCommerce, stage it on the dispute via Stripe's API (submit=false), and present it in the dashboard for review. One click to submit to the bank.

## Stripe Dispute Reasons — Complete Coverage

All 15 Stripe dispute reasons mapped to WooCommerce evidence we can auto-collect:

### 1. `fraudulent` (most common, hardest to win)
- **Auto-fill:** customer_name, customer_email_address, customer_purchase_ip, billing_address, shipping_address, shipping_date, shipping_carrier, shipping_tracking_number
- **Auto-generate:** uncategorized_text with: AVS/CVC match status, 3DS authentication status, order history showing previous successful orders from same customer, subscription acknowledgment (IP + timestamp)
- **Upload:** shipping_documentation (tracking screenshot), customer_signature (if available)

### 2. `subscription_canceled`
- **Auto-fill:** customer_name, customer_email_address, service_date (subscription start)
- **Auto-generate:** cancellation_rebuttal (subscription was active at charge time, no cancellation request found, last renewal date), cancellation_policy_disclosure (how policy was shown at checkout), uncategorized_text (full subscription history: start date, all renewal dates, status at time of charge)
- **Upload:** cancellation_policy (terms), customer_communication (if any)

### 3. `product_not_received`
- **Auto-fill:** shipping_address, shipping_date, shipping_carrier, shipping_tracking_number
- **Auto-generate:** uncategorized_text (delivery confirmation details, order timeline)
- **Upload:** shipping_documentation (tracking proof showing delivered)

### 4. `product_unacceptable`
- **Auto-fill:** product_description, customer_name, customer_email_address
- **Auto-generate:** refund_refusal_explanation, uncategorized_text (product matches description, no return request received, refund policy)
- **Upload:** refund_policy, customer_communication

### 5. `credit_not_processed`
- **Auto-fill:** customer_name, customer_email_address
- **Auto-generate:** refund_policy_disclosure, refund_refusal_explanation (why refund was not issued — no cancellation, still within subscription, etc.)
- **Upload:** refund_policy, customer_communication

### 6. `duplicate`
- **Auto-fill:** duplicate_charge_id (find the other charge), duplicate_charge_explanation
- **Auto-generate:** uncategorized_text explaining charges are for different items/periods
- **Upload:** duplicate_charge_documentation (receipts for both charges)

### 7. `unrecognized`
- **Auto-fill:** customer_name, customer_email_address, customer_purchase_ip, billing_address
- **Auto-generate:** uncategorized_text (order confirmation was sent, customer details match, previous orders from same customer)
- **Upload:** receipt (order confirmation email)

### 8. `general`
- **Auto-fill:** all available customer/order data
- **Auto-generate:** uncategorized_text with full order details and timeline

### 9-15. `bank_cannot_process`, `check_returned`, `debit_not_authorized`, `customer_initiated`, `incorrect_account_details`, `insufficient_funds`, `noncompliant`
- **Auto-fill:** all available customer/order data
- **Auto-generate:** uncategorized_text with order details
- Note: These are rare for WooCommerce/Stripe card payments

## Architecture

### Plugin Side (PHP)
New class: `WCM_Dispute_Evidence_Submitter`

**Methods:**
- `auto_stage_evidence($dispute_id, $order)` — Called when dispute is detected. Gathers all WooCommerce evidence, calls Stripe API with `submit=false` to stage it. No human intervention needed.
- `build_evidence_for_reason($reason, $order)` — Returns array of evidence fields tailored to the dispute reason
- `get_subscription_evidence($order)` — Gets subscription history, acknowledgment, cancellation status
- `get_shipping_evidence($order)` — Gets tracking info from WooCommerce Shipping or ShipStation
- `get_customer_history($email)` — Previous orders from same customer (proves they're a real customer)
- `upload_file_to_stripe($file_path)` — Uploads evidence file and returns file ID
- `submit_evidence($dispute_id)` — Final submission (submit=true), called from dashboard

**Hooks into existing flow:**
- `handle_new_dispute()` in WCM_Dispute_Manager calls `auto_stage_evidence()` after creating the local record
- Hourly cron poll also calls it for any dispute without staged evidence

### Server Side (Node.js)
New endpoints:
- `POST /api/disputes/:id/submit` — Triggers evidence submission on the store via WC REST API
- `GET /api/disputes/:id/evidence` — Returns staged evidence preview

### Dashboard
Upgrade Disputes page:
- Each dispute row shows "Evidence: Staged" / "Evidence: Submitted" / "No Evidence" badge
- Expand row → "Evidence Preview" section showing all fields that will be submitted
- "Submit to Stripe" button (with confirmation dialog)
- "Regenerate Evidence" button if data has changed

## Evidence Auto-Generation Templates

### Subscription Canceled Rebuttal (auto-generated text)
```
This charge is for an active subscription that was not canceled prior to the billing date.

Customer: {customer_name} ({customer_email})
Subscription Start: {start_date}
Billing Cycle: {billing_period}
Last Successful Renewal: {last_renewal_date}
Subscription Status at Charge Time: {status}

No cancellation request was received from the customer before the charge date of {charge_date}. The customer agreed to the subscription terms at checkout on {signup_date} from IP address {signup_ip}.

Previous successful payments on this subscription:
{list of previous renewal dates and amounts}

The cancellation policy was displayed at checkout and requires cancellation before the next billing date. The customer's subscription remained active through the disputed charge period.
```

### Fraudulent Rebuttal (auto-generated text)
```
This transaction was authorized by the cardholder.

Customer: {customer_name}
Email: {customer_email}
Purchase IP: {purchase_ip}
Order Date: {order_date}

Verification Results:
- AVS Match: {avs_result}
- CVC Match: {cvc_result}
- 3D Secure: {3ds_result}

The customer has {previous_order_count} previous orders with our store totaling ${previous_total}, none of which were disputed. The shipping address matches the billing address on file.

{if subscription}
The customer has an active subscription that was initiated on {sub_start_date} with acknowledgment recorded at {ack_timestamp} from IP {ack_ip}.
{/if}

Order was fulfilled and shipped via {carrier} with tracking number {tracking}. Delivery was confirmed on {delivery_date}.
```

### Product Not Received Rebuttal
```
The order was shipped and delivered to the customer's provided address.

Customer: {customer_name}
Shipping Address: {shipping_address}
Ship Date: {ship_date}
Carrier: {carrier}
Tracking Number: {tracking_number}
Delivery Confirmation: {delivery_date}

The tracking information confirms delivery to the address provided by the customer at checkout.
```

## Data Sources (all from WooCommerce — no extra plugin overhead)

| Evidence Field | WooCommerce Source |
|---|---|
| customer_name | `$order->get_billing_first_name() . ' ' . $order->get_billing_last_name()` |
| customer_email | `$order->get_billing_email()` |
| customer_purchase_ip | `$order->get_customer_ip_address()` |
| billing_address | `$order->get_formatted_billing_address()` |
| shipping_address | `$order->get_formatted_shipping_address()` |
| product_description | `$order->get_items()` line items |
| service_date | `$order->get_date_created()` |
| shipping_date | Order meta `_shipping_date` or ShipStation meta |
| shipping_carrier | Order meta `_shipping_carrier` or ShipStation meta |
| shipping_tracking_number | Order meta `_tracking_number` or ShipStation/WC Shipment Tracking |
| AVS/CVC results | Stripe charge metadata via `_stripe_charge_id` |
| 3DS status | Stripe PaymentIntent metadata |
| Subscription history | WC Subscriptions API |
| Acknowledgment | `_wcm_subscription_acknowledgment` order meta |
| Previous orders | `wc_get_orders(['customer' => $email])` |
