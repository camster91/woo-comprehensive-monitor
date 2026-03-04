<?php
/**
 * Settings page for WooCommerce Comprehensive Monitor
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Render settings page
 */
function wcm_render_settings_page() {
    // Save settings if form was submitted
    if (isset($_POST['wcm_settings_nonce']) && wp_verify_nonce($_POST['wcm_settings_nonce'], 'wcm_save_settings')) {
        wcm_save_settings();
    }
    
    // Get current tab
    $current_tab = isset($_GET['tab']) ? sanitize_text_field($_GET['tab']) : 'general';
    
    // Define tabs
    $tabs = array(
        'general' => __('General Settings', 'woo-comprehensive-monitor'),
        'error_tracking' => __('Error Tracking', 'woo-comprehensive-monitor'),
        'dispute_protection' => __('Dispute Protection', 'woo-comprehensive-monitor'),
        'health_monitoring' => __('Health Monitoring', 'woo-comprehensive-monitor'),
        'protection' => __('Price Protection', 'woo-comprehensive-monitor'),
        'preorders' => __('Pre-Orders', 'woo-comprehensive-monitor'),
        'alerts' => __('Alerts & Notifications', 'woo-comprehensive-monitor'),
        'advanced' => __('Advanced', 'woo-comprehensive-monitor'),
    );
    
    ?>
    <div class="wrap wcm-settings">
        <h1><?php _e('WooCommerce Comprehensive Monitor Settings', 'woo-comprehensive-monitor'); ?></h1>
        
        <nav class="nav-tab-wrapper">
            <?php foreach ($tabs as $tab => $label) : ?>
                <a href="<?php echo admin_url('admin.php?page=woo-comprehensive-monitor-settings&tab=' . $tab); ?>" 
                   class="nav-tab <?php echo $current_tab === $tab ? 'nav-tab-active' : ''; ?>">
                    <?php echo esc_html($label); ?>
                </a>
            <?php endforeach; ?>
        </nav>
        
        <form method="post" action="">
            <?php wp_nonce_field('wcm_save_settings', 'wcm_settings_nonce'); ?>
            
            <div class="wcm-settings-content">
                <?php
                switch ($current_tab) {
                    case 'general':
                        wcm_render_general_settings();
                        break;
                    case 'error_tracking':
                        wcm_render_error_tracking_settings();
                        break;
                    case 'dispute_protection':
                        wcm_render_dispute_protection_settings();
                        break;
                    case 'health_monitoring':
                        wcm_render_health_monitoring_settings();
                        break;
                    case 'protection':
                        wcm_render_protection_settings();
                        break;
                    case 'preorders':
                        wcm_render_preorder_settings();
                        break;
                    case 'alerts':
                        wcm_render_alerts_settings();
                        break;
                    case 'advanced':
                        wcm_render_advanced_settings();
                        break;
                }
                ?>
            </div>
            
            <p class="submit">
                <button type="submit" class="button button-primary">
                    <?php _e('Save Settings', 'woo-comprehensive-monitor'); ?>
                </button>
            </p>
        </form>
    </div>
    <?php
}

/**
 * Save settings
 */
function wcm_save_settings() {
    // General settings
    if (isset($_POST['wcm_monitoring_server'])) {
        update_option('wcm_monitoring_server', sanitize_text_field($_POST['wcm_monitoring_server']));
    }
    
    if (isset($_POST['wcm_alert_email'])) {
        update_option('wcm_alert_email', sanitize_email($_POST['wcm_alert_email']));
    }
    
    // Force all products checkbox
    update_option('wcm_force_all_products', isset($_POST['wcm_force_all_products']) ? '1' : '0');
    
    // Error tracking settings
    $error_tracking_options = array(
        'wcm_track_js_errors',
        'wcm_track_ajax_errors',
        'wcm_track_checkout_errors',
    );
    
    foreach ($error_tracking_options as $option) {
        update_option($option, isset($_POST[$option]) ? '1' : '0');
    }
    
    // Dispute protection settings
    $dispute_options = array(
        'wcm_enable_dispute_protection',
        'wcm_auto_generate_evidence',
        'wcm_send_dispute_alerts',
    );
    
    foreach ($dispute_options as $option) {
        update_option($option, isset($_POST[$option]) ? '1' : '0');
    }
    
    // Health monitoring settings
    $health_options = array(
        'wcm_enable_health_monitoring',
    );
    
    foreach ($health_options as $option) {
        update_option($option, isset($_POST[$option]) ? '1' : '0');
    }
    
    if (isset($_POST['wcm_health_check_interval'])) {
        $interval = absint($_POST['wcm_health_check_interval']);
        if ($interval >= 300) { // Minimum 5 minutes
            update_option('wcm_health_check_interval', $interval);
        }
    }
    
    // Alert settings
    $alert_options = array(
        'wcm_send_email_alerts',
        'wcm_send_slack_alerts',
        'wcm_send_discord_alerts',
    );
    
    foreach ($alert_options as $option) {
        update_option($option, isset($_POST[$option]) ? '1' : '0');
    }
    
    if (isset($_POST['wcm_slack_webhook'])) {
        update_option('wcm_slack_webhook', sanitize_text_field($_POST['wcm_slack_webhook']));
    }
    
    if (isset($_POST['wcm_discord_webhook'])) {
        update_option('wcm_discord_webhook', sanitize_text_field($_POST['wcm_discord_webhook']));
    }
    
    // Advanced settings
    if (isset($_POST['wcm_log_retention_days'])) {
        $days = absint($_POST['wcm_log_retention_days']);
        if ($days >= 1 && $days <= 365) {
            update_option('wcm_log_retention_days', $days);
        }
    }
    
    if (isset($_POST['wcm_debug_mode'])) {
        update_option('wcm_debug_mode', '1');
    } else {
        update_option('wcm_debug_mode', '0');
    }
    
    // Subscription price protection settings
    $sp_options = array( 'wcm_sp_auto_charge_on_cancel', 'wcm_sp_customer_conversion', 'wcm_sp_charge_method' );
    foreach ( $sp_options as $opt ) {
        if ( isset( $_POST[ $opt ] ) ) {
            update_option( $opt, sanitize_text_field( $_POST[ $opt ] ) );
        }
    }
    $sp_checkboxes = array( 'wcm_sp_notify_customer', 'wcm_sp_notify_admin' );
    foreach ( $sp_checkboxes as $opt ) {
        update_option( $opt, isset( $_POST[ $opt ] ) ? 'yes' : 'no' );
    }

    // Acknowledgment settings
    if (isset($_POST['wcm_acknowledgment_text'])) {
        update_option('wcm_acknowledgment_text', sanitize_textarea_field($_POST['wcm_acknowledgment_text']));
    }
    
    add_settings_error(
        'wcm_settings',
        'wcm_settings_saved',
        __('Settings saved successfully.', 'woo-comprehensive-monitor'),
        'success'
    );
}

/**
 * Render general settings
 */
function wcm_render_general_settings() {
    $monitoring_server = get_option('wcm_monitoring_server', 'https://woo.ashbi.ca/api/track-woo-error');
    $alert_email = get_option('wcm_alert_email', get_option('admin_email'));
    ?>
    
    <table class="form-table">
        <tr>
            <th scope="row">
                <label for="wcm_monitoring_server"><?php _e('Monitoring Server URL', 'woo-comprehensive-monitor'); ?></label>
            </th>
            <td>
                <input type="url" 
                       id="wcm_monitoring_server" 
                       name="wcm_monitoring_server" 
                       value="<?php echo esc_attr($monitoring_server); ?>" 
                       class="regular-text"
                       placeholder="https://woo.ashbi.ca/api/track-woo-error">
                <p class="description">
                    <?php _e('URL of your central monitoring server. All errors, disputes, and health alerts will be sent here.', 'woo-comprehensive-monitor'); ?>
                </p>
            </td>
        </tr>
        
        <tr>
            <th scope="row">
                <label for="wcm_alert_email"><?php _e('Alert Email Address', 'woo-comprehensive-monitor'); ?></label>
            </th>
            <td>
                <input type="email" 
                       id="wcm_alert_email" 
                       name="wcm_alert_email" 
                       value="<?php echo esc_attr($alert_email); ?>" 
                       class="regular-text">
                <p class="description">
                    <?php _e('Email address where critical alerts will be sent.', 'woo-comprehensive-monitor'); ?>
                </p>
            </td>
        </tr>
        
        <tr>
            <th scope="row">
                <label for="wcm_force_all_products"><?php _e('Force All Products', 'woo-comprehensive-monitor'); ?></label>
            </th>
            <td>
                <label>
                    <input type="checkbox" 
                           id="wcm_force_all_products" 
                           name="wcm_force_all_products" 
                           value="1" 
                           <?php checked( get_option( 'wcm_force_all_products', '0' ), '1' ); ?>>
                    <?php _e('Require acknowledgment for ALL products (not just subscriptions)', 'woo-comprehensive-monitor'); ?>
                </label>
                <p class="description">
                    <?php _e('If enabled, customers must acknowledge the recurring payment terms for any purchase, even one-time products.', 'woo-comprehensive-monitor'); ?>
                </p>
            </td>
        </tr>
        
        <tr>
            <th scope="row">
                <?php _e('Test Connection', 'woo-comprehensive-monitor'); ?>
            </th>
            <td>
                <button type="button" class="button" id="wcm-test-connection">
                    <?php _e('Test Connection to Monitoring Server', 'woo-comprehensive-monitor'); ?>
                </button>
                <span id="wcm-test-result" style="margin-left: 10px;"></span>
                <p class="description">
                    <?php _e('Test if your store can connect to the monitoring server.', 'woo-comprehensive-monitor'); ?>
                </p>
            </td>
        </tr>
    </table>
    
    <script>
    jQuery(document).ready(function($) {
        $('#wcm-test-connection').on('click', function() {
            var $button = $(this);
            var $result = $('#wcm-test-result');
            
            $button.prop('disabled', true).text('Testing...');
            $result.html('');
            
            $.ajax({
                url: ajaxurl,
                method: 'POST',
                data: {
                    action: 'wcm_test_connection',
                    nonce: '<?php echo wp_create_nonce('wcm_test_connection'); ?>',
                    server_url: $('#wcm_monitoring_server').val()
                },
                success: function(response) {
                    if (response.success) {
                        $result.html('<span style="color: #4CAF50;">✓ ' + response.data.message + '</span>');
                    } else {
                        $result.html('<span style="color: #F44336;">✗ ' + response.data + '</span>');
                    }
                },
                error: function() {
                    $result.html('<span style="color: #F44336;">✗ Connection test failed</span>');
                },
                complete: function() {
                    $button.prop('disabled', false).text('Test Connection to Monitoring Server');
                }
            });
        });
    });
    </script>
    
    <?php
}

/**
 * Render error tracking settings
 */
function wcm_render_error_tracking_settings() {
    $track_js_errors = get_option('wcm_track_js_errors', '1');
    $track_ajax_errors = get_option('wcm_track_ajax_errors', '1');
    $track_checkout_errors = get_option('wcm_track_checkout_errors', '1');
    ?>
    
    <table class="form-table">
        <tr>
            <th scope="row">
                <?php _e('Error Tracking Options', 'woo-comprehensive-monitor'); ?>
            </th>
            <td>
                <fieldset>
                    <legend class="screen-reader-text">
                        <span><?php _e('Error Tracking Options', 'woo-comprehensive-monitor'); ?></span>
                    </legend>
                    
                    <label for="wcm_track_js_errors">
                        <input type="checkbox" 
                               id="wcm_track_js_errors" 
                               name="wcm_track_js_errors" 
                               value="1" 
                               <?php checked($track_js_errors, '1'); ?>>
                        <?php _e('Track JavaScript errors', 'woo-comprehensive-monitor'); ?>
                    </label>
                    <p class="description">
                        <?php _e('Track uncaught JavaScript errors on WooCommerce pages (checkout, cart, product pages).', 'woo-comprehensive-monitor'); ?>
                    </p>
                    
                    <br>
                    
                    <label for="wcm_track_ajax_errors">
                        <input type="checkbox" 
                               id="wcm_track_ajax_errors" 
                               name="wcm_track_ajax_errors" 
                               value="1" 
                               <?php checked($track_ajax_errors, '1'); ?>>
                        <?php _e('Track AJAX errors', 'woo-comprehensive-monitor'); ?>
                    </label>
                    <p class="description">
                        <?php _e('Track AJAX request failures (add to cart, update cart, checkout validation).', 'woo-comprehensive-monitor'); ?>
                    </p>
                    
                    <br>
                    
                    <label for="wcm_track_checkout_errors">
                        <input type="checkbox" 
                               id="wcm_track_checkout_errors" 
                               name="wcm_track_checkout_errors" 
                               value="1" 
                               <?php checked($track_checkout_errors, '1'); ?>>
                        <?php _e('Track checkout errors', 'woo-comprehensive-monitor'); ?>
                    </label>
                    <p class="description">
                        <?php _e('Track WooCommerce checkout form validation errors and payment gateway errors.', 'woo-comprehensive-monitor'); ?>
                    </p>
                </fieldset>
            </td>
        </tr>
        
        <tr>
            <th scope="row">
                <?php _e('Error Tracking Coverage', 'woo-comprehensive-monitor'); ?>
            </th>
            <td>
                <div class="wcm-coverage-info">
                    <p><?php _e('Error tracking is enabled on the following pages:', 'woo-comprehensive-monitor'); ?></p>
                    <ul>
                        <li><?php _e('Checkout page', 'woo-comprehensive-monitor'); ?></li>
                        <li><?php _e('Cart page', 'woo-comprehensive-monitor'); ?></li>
                        <li><?php _e('Single product pages', 'woo-comprehensive-monitor'); ?></li>
                        <li><?php _e('Shop page (if AJAX add to cart is enabled)', 'woo-comprehensive-monitor'); ?></li>
                    </ul>
                    <p class="description">
                        <?php _e('Errors are tracked in real-time and sent to your monitoring server.', 'woo-comprehensive-monitor'); ?>
                    </p>
                </div>
            </td>
        </tr>
    </table>
    
    <?php
}

/**
 * Render dispute protection settings
 */
function wcm_render_dispute_protection_settings() {
    $enable_dispute_protection = get_option('wcm_enable_dispute_protection', '1');
    $auto_generate_evidence = get_option('wcm_auto_generate_evidence', '1');
    $send_dispute_alerts = get_option('wcm_send_dispute_alerts', '1');
    ?>
    
    <table class="form-table">
        <tr>
            <th scope="row">
                <?php _e('Dispute Protection', 'woo-comprehensive-monitor'); ?>
            </th>
            <td>
                <fieldset>
                    <legend class="screen-reader-text">
                        <span><?php _e('Dispute Protection', 'woo-comprehensive-monitor'); ?></span>
                    </legend>
                    
                    <label for="wcm_enable_dispute_protection">
                        <input type="checkbox" 
                               id="wcm_enable_dispute_protection" 
                               name="wcm_enable_dispute_protection" 
                               value="1" 
                               <?php checked($enable_dispute_protection, '1'); ?>>
                        <?php _e('Enable dispute protection', 'woo-comprehensive-monitor'); ?>
                    </label>
                    <p class="description">
                        <?php _e('Automatically detect Stripe disputes and generate evidence.', 'woo-comprehensive-monitor'); ?>
                    </p>
                    
                    <br>
                    
                    <label for="wcm_auto_generate_evidence">
                        <input type="checkbox" 
                               id="wcm_auto_generate_evidence" 
                               name="wcm_auto_generate_evidence" 
                               value="1" 
                               <?php checked($auto_generate_evidence, '1'); ?>>
                        <?php _e('Automatically generate dispute evidence', 'woo-comprehensive-monitor'); ?>
                    </label>
                    <p class="description">
                        <?php _e('When a dispute is detected, automatically gather order details, customer information, and subscription acknowledgments.', 'woo-comprehensive-monitor'); ?>
                    </p>
                    
                    <br>
                    
                    <label for="wcm_send_dispute_alerts">
                        <input type="checkbox" 
                               id="wcm_send_dispute_alerts" 
                               name="wcm_send_dispute_alerts" 
                               value="1" 
                               <?php checked($send_dispute_alerts, '1'); ?>>
                        <?php _e('Send dispute alerts', 'woo-comprehensive-monitor'); ?>
                    </label>
                    <p class="description">
                        <?php _e('Send alerts to your monitoring server when new disputes are detected.', 'woo-comprehensive-monitor'); ?>
                    </p>
                </fieldset>
            </td>
        </tr>
        
        <tr>
            <th scope="row">
                <?php _e('Stripe Webhook Setup', 'woo-comprehensive-monitor'); ?>
            </th>
            <td>
                <div class="wcm-webhook-info">
                    <p><?php _e('To enable automatic dispute detection, you need to set up a Stripe webhook:', 'woo-comprehensive-monitor'); ?></p>
                    <ol>
                        <li><?php _e('Go to your Stripe Dashboard → Developers → Webhooks', 'woo-comprehensive-monitor'); ?></li>
                        <li><?php _e('Click "Add endpoint"', 'woo-comprehensive-monitor'); ?></li>
                        <li><?php printf(__('Enter this URL: %s', 'woo-comprehensive-monitor'), '<code>' . rest_url('wcm/v1/stripe-webhook') . '</code>'); ?></li>
                        <li><?php _e('Select these events:', 'woo-comprehensive-monitor'); ?>
                            <ul>
                                <li><code>charge.dispute.created</code></li>
                                <li><code>charge.dispute.updated</code></li>
                                <li><code>charge.dispute.closed</code></li>
                            </ul>
                        </li>
                        <li><?php _e('Click "Add endpoint" to save', 'woo-comprehensive-monitor'); ?></li>
                    </ol>
                    <p class="description">
                        <?php _e('The webhook endpoint is automatically registered by this plugin.', 'woo-comprehensive-monitor'); ?>
                    </p>
                </div>
            </td>
        </tr>
    </table>
    <?php
}

/**
 * Render health monitoring settings
 */
function wcm_render_health_monitoring_settings() {
    $enable = get_option('wcm_enable_health_monitoring', '1');
    $interval = get_option('wcm_health_check_interval', '3600');
    ?>
    <table class="form-table">
        <tr>
            <th scope="row"><?php _e('Health Monitoring', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <label><input type="checkbox" name="wcm_enable_health_monitoring" value="1" <?php checked($enable, '1'); ?>> <?php _e('Enable health monitoring', 'woo-comprehensive-monitor'); ?></label>
                <p class="description"><?php _e('Run periodic health checks on WooCommerce, Stripe, server resources, and more.', 'woo-comprehensive-monitor'); ?></p>
            </td>
        </tr>
        <tr>
            <th scope="row"><label for="wcm_health_check_interval"><?php _e('Check Interval (seconds)', 'woo-comprehensive-monitor'); ?></label></th>
            <td>
                <input type="number" id="wcm_health_check_interval" name="wcm_health_check_interval" value="<?php echo esc_attr($interval); ?>" min="300" step="300" class="small-text">
                <p class="description"><?php _e('How often to run health checks. Default: 3600 (1 hour). Minimum: 300 (5 min).', 'woo-comprehensive-monitor'); ?></p>
            </td>
        </tr>
    </table>
    <?php
}

/**
 * Render subscription price protection settings
 */
function wcm_render_protection_settings() {
    $auto_charge = get_option('wcm_sp_auto_charge_on_cancel', 'yes');
    $conversion = get_option('wcm_sp_customer_conversion', 'yes');
    $method = get_option('wcm_sp_charge_method', 'automatic');
    $notify_customer = get_option('wcm_sp_notify_customer', 'yes');
    $notify_admin = get_option('wcm_sp_notify_admin', 'yes');
    $ack_text = get_option('wcm_acknowledgment_text', '');
    ?>
    <h2><?php _e('Subscription Price Protection', 'woo-comprehensive-monitor'); ?></h2>
    <p class="description"><?php _e('Prevents customers from subscribing just to get a discount. When they cancel or convert to a one-time purchase, the difference between the subscription price and the one-time price is charged.', 'woo-comprehensive-monitor'); ?></p>

    <table class="form-table">
        <tr>
            <th scope="row"><?php _e('Auto-Charge on Cancellation', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <select name="wcm_sp_auto_charge_on_cancel">
                    <option value="yes" <?php selected($auto_charge, 'yes'); ?>><?php _e('Yes — Charge when subscription is cancelled', 'woo-comprehensive-monitor'); ?></option>
                    <option value="no" <?php selected($auto_charge, 'no'); ?>><?php _e('No — Admin must charge manually', 'woo-comprehensive-monitor'); ?></option>
                </select>
                <p class="description"><?php _e('When enabled, the price difference is automatically charged when a subscription is cancelled.', 'woo-comprehensive-monitor'); ?></p>
            </td>
        </tr>
        <tr>
            <th scope="row"><?php _e('Customer Self-Service', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <select name="wcm_sp_customer_conversion">
                    <option value="yes" <?php selected($conversion, 'yes'); ?>><?php _e('Yes — Show "Switch to One-Time Purchase" on My Account', 'woo-comprehensive-monitor'); ?></option>
                    <option value="no" <?php selected($conversion, 'no'); ?>><?php _e('No — Admin-only', 'woo-comprehensive-monitor'); ?></option>
                </select>
                <p class="description"><?php _e('Lets customers voluntarily convert their subscription to a one-time purchase and pay the difference.', 'woo-comprehensive-monitor'); ?></p>
            </td>
        </tr>
        <tr>
            <th scope="row"><?php _e('Charge Method', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <select name="wcm_sp_charge_method">
                    <option value="automatic" <?php selected($method, 'automatic'); ?>><?php _e('Automatic — Charge saved payment method', 'woo-comprehensive-monitor'); ?></option>
                    <option value="manual" <?php selected($method, 'manual'); ?>><?php _e('Manual — Create pending order for admin review', 'woo-comprehensive-monitor'); ?></option>
                </select>
                <p class="description"><?php _e('Automatic tries the saved payment method first (any gateway: Stripe, PayPal, Square), then creates a pending order if that fails.', 'woo-comprehensive-monitor'); ?></p>
            </td>
        </tr>
        <tr>
            <th scope="row"><?php _e('Notifications', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <label><input type="checkbox" name="wcm_sp_notify_customer" value="yes" <?php checked($notify_customer, 'yes'); ?>> <?php _e('Email customer when charged', 'woo-comprehensive-monitor'); ?></label><br>
                <label><input type="checkbox" name="wcm_sp_notify_admin" value="yes" <?php checked($notify_admin, 'yes'); ?>> <?php _e('Email admin when charged', 'woo-comprehensive-monitor'); ?></label>
            </td>
        </tr>
    </table>

    <h3><?php _e('Setting the One-Time Price', 'woo-comprehensive-monitor'); ?></h3>
    <table class="form-table">
        <tr>
            <th scope="row"><?php _e('Setup (required)', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <p><strong><?php _e('You must configure the one-time price on each subscription product. There is no guessing.', 'woo-comprehensive-monitor'); ?></strong></p>
                <p><?php _e('Go to the product editor and under Pricing, you\'ll see two fields:', 'woo-comprehensive-monitor'); ?></p>
                <ol style="margin:0 0 10px;padding-left:20px;">
                    <li><strong><?php _e('Linked One-Time Variation', 'woo-comprehensive-monitor'); ?></strong> — <?php _e('Search and select the actual one-time variation of your product. The system reads its real WooCommerce price. Best option — price stays in sync automatically.', 'woo-comprehensive-monitor'); ?></li>
                    <li><strong><?php _e('One-Time Price', 'woo-comprehensive-monitor'); ?></strong> — <?php _e('Enter the price directly (e.g. $12). Use this if you don\'t have a one-time variation, or as an override.', 'woo-comprehensive-monitor'); ?></li>
                </ol>
                <p class="description"><?php _e('If neither is set, the product is skipped — no charge is created. This is intentional: we only charge when you\'ve explicitly defined the one-time price.', 'woo-comprehensive-monitor'); ?></p>

                <div style="margin-top:12px;padding:12px;background:#f0f6fc;border-left:4px solid #2271b1;">
                    <strong><?php _e('Example:', 'woo-comprehensive-monitor'); ?></strong><br>
                    <?php _e('Product "Coffee" has two variations:', 'woo-comprehensive-monitor'); ?><br>
                    <?php _e('&nbsp;&nbsp;• "Subscribe & Save" — $8/mo', 'woo-comprehensive-monitor'); ?><br>
                    <?php _e('&nbsp;&nbsp;• "One-Time" — $12', 'woo-comprehensive-monitor'); ?><br><br>
                    <?php _e('→ On the subscription product, set "Linked One-Time Variation" to the $12 variation', 'woo-comprehensive-monitor'); ?><br>
                    <?php _e('→ When customer cancels, system reads the variation\'s real price ($12) and charges $12 - $8 = $4', 'woo-comprehensive-monitor'); ?><br>
                    <?php _e('→ If you later change the one-time variation to $15, the system automatically uses $15', 'woo-comprehensive-monitor'); ?>
                </div>
            </td>
        </tr>
        <tr>
            <th scope="row"><?php _e('Admin', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <ul style="margin:0;padding-left:20px;list-style:disc;">
                    <li><?php _e('"Price Protection" meta-box on the subscription edit page — shows breakdown and "Charge" button', 'woo-comprehensive-monitor'); ?></li>
                    <li><?php _e('"Price Diff" column on the subscriptions list — shows uncharged amount or ✓', 'woo-comprehensive-monitor'); ?></li>
                    <li><?php _e('"Price Adjustments" page in My Account for customers to see their charges', 'woo-comprehensive-monitor'); ?></li>
                </ul>
            </td>
        </tr>
        <tr>
            <th scope="row"><?php _e('Supported Gateways', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <p><?php _e('Stripe, PayPal, Square, Authorize.net — any gateway that supports WooCommerce Subscriptions renewal hooks. Falls back to direct Stripe API for WPSubscription.', 'woo-comprehensive-monitor'); ?></p>
            </td>
        </tr>
    </table>

    <h3><?php _e('Checkout Acknowledgment', 'woo-comprehensive-monitor'); ?></h3>
    <table class="form-table">
        <tr>
            <th scope="row"><label for="wcm_acknowledgment_text"><?php _e('Acknowledgment Text', 'woo-comprehensive-monitor'); ?></label></th>
            <td>
                <textarea id="wcm_acknowledgment_text" name="wcm_acknowledgment_text" rows="3" class="large-text"><?php echo esc_textarea($ack_text); ?></textarea>
                <p class="description"><?php _e('Required checkbox at checkout for subscription products. Customers must agree before purchasing. This acknowledgment is stored and used as evidence in disputes.', 'woo-comprehensive-monitor'); ?></p>
            </td>
        </tr>
    </table>
    <?php
}

/**
 * Render pre-order settings
 */
function wcm_render_preorder_settings() {
    ?>
    <h2><?php _e('Pre-Order System', 'woo-comprehensive-monitor'); ?></h2>
    <p class="description"><?php _e('Pre-orders are automatically enabled for any product with backorders allowed. No additional configuration needed.', 'woo-comprehensive-monitor'); ?></p>

    <table class="form-table">
        <tr>
            <th scope="row"><?php _e('How It Works', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <ol style="margin:0;padding-left:20px;">
                    <li><?php _e('Go to any product → Inventory tab → set "Allow backorders?" to "Allow" or "Allow, but notify customer"', 'woo-comprehensive-monitor'); ?></li>
                    <li><?php _e('Set optional availability date, button text, and message in the Pre-Order Settings section', 'woo-comprehensive-monitor'); ?></li>
                    <li><?php _e('Customers see "Pre-Order Now" button and a notice that their card will only be charged on shipment', 'woo-comprehensive-monitor'); ?></li>
                    <li><?php _e('At checkout, Stripe saves the card via SetupIntent (no charge)', 'woo-comprehensive-monitor'); ?></li>
                    <li><?php _e('When you change the order to "Completed", the saved card is charged automatically', 'woo-comprehensive-monitor'); ?></li>
                </ol>
            </td>
        </tr>
        <tr>
            <th scope="row"><?php _e('Custom Order Statuses', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <ul style="margin:0;padding-left:20px;">
                    <li><strong>Pre-Ordered</strong> — <?php _e('Card saved, awaiting shipment', 'woo-comprehensive-monitor'); ?></li>
                    <li><strong>Pre-Order Payment Failed</strong> — <?php _e('Charge failed (card expired, insufficient funds, etc.)', 'woo-comprehensive-monitor'); ?></li>
                </ul>
            </td>
        </tr>
        <tr>
            <th scope="row"><?php _e('Retry Logic', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <p><?php _e('If a charge fails, it automatically retries once after 24 hours. After the second failure, the order is marked as "Pre-Order Payment Failed" for manual handling.', 'woo-comprehensive-monitor'); ?></p>
            </td>
        </tr>
        <tr>
            <th scope="row"><?php _e('Mixed Cart Prevention', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <p><?php _e('Customers cannot mix pre-order and in-stock items in the same cart. They must checkout separately.', 'woo-comprehensive-monitor'); ?></p>
            </td>
        </tr>
    </table>
    <?php
}

/**
 * Render alerts settings
 */
function wcm_render_alerts_settings() {
    $send_email = get_option('wcm_send_email_alerts', '1');
    $send_slack = get_option('wcm_send_slack_alerts', '0');
    $slack_webhook = get_option('wcm_slack_webhook', '');
    $send_discord = get_option('wcm_send_discord_alerts', '0');
    $discord_webhook = get_option('wcm_discord_webhook', '');
    ?>
    <table class="form-table">
        <tr>
            <th scope="row"><?php _e('Email Alerts', 'woo-comprehensive-monitor'); ?></th>
            <td><label><input type="checkbox" name="wcm_send_email_alerts" value="1" <?php checked($send_email, '1'); ?>> <?php _e('Send email alerts for critical issues', 'woo-comprehensive-monitor'); ?></label></td>
        </tr>
        <tr>
            <th scope="row"><?php _e('Slack Alerts', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <label><input type="checkbox" name="wcm_send_slack_alerts" value="1" <?php checked($send_slack, '1'); ?>> <?php _e('Send Slack alerts', 'woo-comprehensive-monitor'); ?></label><br>
                <input type="url" name="wcm_slack_webhook" value="<?php echo esc_attr($slack_webhook); ?>" class="regular-text" placeholder="https://hooks.slack.com/services/...">
            </td>
        </tr>
        <tr>
            <th scope="row"><?php _e('Discord Alerts', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <label><input type="checkbox" name="wcm_send_discord_alerts" value="1" <?php checked($send_discord, '1'); ?>> <?php _e('Send Discord alerts', 'woo-comprehensive-monitor'); ?></label><br>
                <input type="url" name="wcm_discord_webhook" value="<?php echo esc_attr($discord_webhook); ?>" class="regular-text" placeholder="https://discord.com/api/webhooks/...">
            </td>
        </tr>
    </table>
    <?php
}

/**
 * Render advanced settings
 */
function wcm_render_advanced_settings() {
    $retention = get_option('wcm_log_retention_days', 30);
    $debug = get_option('wcm_debug_mode', '0');
    $store_id = get_option('wcm_store_id', '');
    ?>
    <table class="form-table">
        <tr>
            <th scope="row"><label for="wcm_log_retention_days"><?php _e('Log Retention (days)', 'woo-comprehensive-monitor'); ?></label></th>
            <td>
                <input type="number" id="wcm_log_retention_days" name="wcm_log_retention_days" value="<?php echo esc_attr($retention); ?>" min="1" max="365" class="small-text">
                <p class="description"><?php _e('Number of days to keep error and health logs.', 'woo-comprehensive-monitor'); ?></p>
            </td>
        </tr>
        <tr>
            <th scope="row"><?php _e('Debug Mode', 'woo-comprehensive-monitor'); ?></th>
            <td><label><input type="checkbox" name="wcm_debug_mode" value="1" <?php checked($debug, '1'); ?>> <?php _e('Enable debug logging (WooCommerce → Status → Logs)', 'woo-comprehensive-monitor'); ?></label></td>
        </tr>
        <tr>
            <th scope="row"><?php _e('Store ID', 'woo-comprehensive-monitor'); ?></th>
            <td><code><?php echo esc_html($store_id); ?></code><p class="description"><?php _e('Auto-generated unique identifier for this store.', 'woo-comprehensive-monitor'); ?></p></td>
        </tr>
        <tr>
            <th scope="row"><?php _e('Plugin Version', 'woo-comprehensive-monitor'); ?></th>
            <td><code><?php echo esc_html(WCM_VERSION); ?></code></td>
        </tr>
    </table>
    <?php
}