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
        'recovery' => __('Discount Recovery', 'woo-comprehensive-monitor'),
        'price_diff' => __('Price Diff Charger', 'woo-comprehensive-monitor'),
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
                    case 'recovery':
                        wcm_render_recovery_settings();
                        break;
                    case 'price_diff':
                        wcm_render_price_diff_settings();
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
    
    // Recovery settings
    if (isset($_POST['wcm_recovery_enabled'])) {
        update_option('wcm_recovery_enabled', sanitize_text_field($_POST['wcm_recovery_enabled']));
    }
    if (isset($_POST['wcm_recovery_minimum_orders'])) {
        update_option('wcm_recovery_minimum_orders', max(1, absint($_POST['wcm_recovery_minimum_orders'])));
    }
    if (isset($_POST['wcm_recovery_grace_period'])) {
        update_option('wcm_recovery_grace_period', absint($_POST['wcm_recovery_grace_period']));
    }
    if (isset($_POST['wcm_recovery_charge_method'])) {
        update_option('wcm_recovery_charge_method', sanitize_text_field($_POST['wcm_recovery_charge_method']));
    }
    $recovery_checkboxes = array('wcm_recovery_notify_customer', 'wcm_recovery_notify_admin');
    foreach ($recovery_checkboxes as $opt) {
        update_option($opt, isset($_POST[$opt]) ? 'yes' : 'no');
    }
    if (isset($_POST['wcm_recovery_exempt_roles'])) {
        update_option('wcm_recovery_exempt_roles', array_map('sanitize_text_field', (array) $_POST['wcm_recovery_exempt_roles']));
    } else {
        update_option('wcm_recovery_exempt_roles', array());
    }

    // Price diff charger settings
    if (isset($_POST['wcm_spd_auto_charge_on_cancel'])) {
        update_option('wcm_spd_auto_charge_on_cancel', sanitize_text_field($_POST['wcm_spd_auto_charge_on_cancel']));
    }
    if (isset($_POST['wcm_spd_customer_self_service'])) {
        update_option('wcm_spd_customer_self_service', sanitize_text_field($_POST['wcm_spd_customer_self_service']));
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
 * Render recovery settings (from Wp-Refund)
 */
function wcm_render_recovery_settings() {
    $enabled = get_option('wcm_recovery_enabled', 'yes');
    $min_orders = get_option('wcm_recovery_minimum_orders', 2);
    $grace = get_option('wcm_recovery_grace_period', 0);
    $method = get_option('wcm_recovery_charge_method', 'manual');
    $notify_customer = get_option('wcm_recovery_notify_customer', 'yes');
    $notify_admin = get_option('wcm_recovery_notify_admin', 'yes');
    $exempt_roles = (array) get_option('wcm_recovery_exempt_roles', array());
    $ack_text = get_option('wcm_acknowledgment_text', '');
    ?>
    <h2><?php _e('Subscription Discount Recovery', 'woo-comprehensive-monitor'); ?></h2>
    <p class="description"><?php _e('When customers cancel subscriptions early, recover the discount difference between regular and subscription pricing.', 'woo-comprehensive-monitor'); ?></p>

    <table class="form-table">
        <tr>
            <th scope="row"><?php _e('Enable Recovery', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <select name="wcm_recovery_enabled">
                    <option value="yes" <?php selected($enabled, 'yes'); ?>><?php _e('Enabled', 'woo-comprehensive-monitor'); ?></option>
                    <option value="no" <?php selected($enabled, 'no'); ?>><?php _e('Disabled', 'woo-comprehensive-monitor'); ?></option>
                </select>
            </td>
        </tr>
        <tr>
            <th scope="row"><label for="wcm_recovery_minimum_orders"><?php _e('Minimum Orders', 'woo-comprehensive-monitor'); ?></label></th>
            <td>
                <input type="number" id="wcm_recovery_minimum_orders" name="wcm_recovery_minimum_orders" value="<?php echo esc_attr($min_orders); ?>" min="1" class="small-text">
                <p class="description"><?php _e('Number of completed orders before a customer can cancel without a recovery charge. Default: 2.', 'woo-comprehensive-monitor'); ?></p>
            </td>
        </tr>
        <tr>
            <th scope="row"><label for="wcm_recovery_grace_period"><?php _e('Grace Period (days)', 'woo-comprehensive-monitor'); ?></label></th>
            <td>
                <input type="number" id="wcm_recovery_grace_period" name="wcm_recovery_grace_period" value="<?php echo esc_attr($grace); ?>" min="0" class="small-text">
                <p class="description"><?php _e('Days after subscription start where cancellation is free. 0 = no grace period.', 'woo-comprehensive-monitor'); ?></p>
            </td>
        </tr>
        <tr>
            <th scope="row"><?php _e('Charge Method', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <select name="wcm_recovery_charge_method">
                    <option value="manual" <?php selected($method, 'manual'); ?>><?php _e('Manual — Create pending order', 'woo-comprehensive-monitor'); ?></option>
                    <option value="automatic" <?php selected($method, 'automatic'); ?>><?php _e('Automatic — Charge saved payment method', 'woo-comprehensive-monitor'); ?></option>
                </select>
                <p class="description"><?php _e('Manual creates a pending order for admin review. Automatic charges the saved Stripe card immediately.', 'woo-comprehensive-monitor'); ?></p>
            </td>
        </tr>
        <tr>
            <th scope="row"><?php _e('Notifications', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <label><input type="checkbox" name="wcm_recovery_notify_customer" value="yes" <?php checked($notify_customer, 'yes'); ?>> <?php _e('Notify customer', 'woo-comprehensive-monitor'); ?></label><br>
                <label><input type="checkbox" name="wcm_recovery_notify_admin" value="yes" <?php checked($notify_admin, 'yes'); ?>> <?php _e('Notify admin', 'woo-comprehensive-monitor'); ?></label>
            </td>
        </tr>
        <tr>
            <th scope="row"><?php _e('Exempt Roles', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <?php
                $roles = wp_roles()->roles;
                foreach ($roles as $slug => $role) {
                    printf(
                        '<label><input type="checkbox" name="wcm_recovery_exempt_roles[]" value="%s" %s> %s</label><br>',
                        esc_attr($slug),
                        checked(in_array($slug, $exempt_roles, true), true, false),
                        esc_html($role['name'])
                    );
                }
                ?>
                <p class="description"><?php _e('Users with these roles will not be charged recovery fees.', 'woo-comprehensive-monitor'); ?></p>
            </td>
        </tr>
    </table>

    <h2><?php _e('Checkout Acknowledgment', 'woo-comprehensive-monitor'); ?></h2>
    <table class="form-table">
        <tr>
            <th scope="row"><label for="wcm_acknowledgment_text"><?php _e('Acknowledgment Text', 'woo-comprehensive-monitor'); ?></label></th>
            <td>
                <textarea id="wcm_acknowledgment_text" name="wcm_acknowledgment_text" rows="3" class="large-text"><?php echo esc_textarea($ack_text); ?></textarea>
                <p class="description"><?php _e('Text shown as a required checkbox on checkout for subscription products. The customer must agree before purchasing.', 'woo-comprehensive-monitor'); ?></p>
            </td>
        </tr>
    </table>
    <?php
}

/**
 * Render price diff charger settings (from subscription-price-diff-charger)
 */
function wcm_render_price_diff_settings() {
    $auto_charge = get_option('wcm_spd_auto_charge_on_cancel', 'no');
    $self_service = get_option('wcm_spd_customer_self_service', 'yes');
    $has_wcs = class_exists('WC_Subscriptions');
    ?>
    <h2><?php _e('Subscription Price Difference Charger', 'woo-comprehensive-monitor'); ?></h2>
    <p class="description"><?php _e('When a customer cancels or converts their WooCommerce Subscription, charge the difference between the subscription (discounted) price and the regular (one-time) price.', 'woo-comprehensive-monitor'); ?></p>

    <?php if (!$has_wcs) : ?>
    <div class="notice notice-warning inline" style="margin:15px 0;"><p><?php _e('⚠️ WooCommerce Subscriptions is not active. Price Difference Charger requires it to function.', 'woo-comprehensive-monitor'); ?></p></div>
    <?php endif; ?>

    <table class="form-table">
        <tr>
            <th scope="row"><?php _e('Auto-Charge on Cancellation', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <select name="wcm_spd_auto_charge_on_cancel">
                    <option value="no" <?php selected($auto_charge, 'no'); ?>><?php _e('No — Manual only (admin clicks "Charge Difference")', 'woo-comprehensive-monitor'); ?></option>
                    <option value="yes" <?php selected($auto_charge, 'yes'); ?>><?php _e('Yes — Automatically charge when subscription is cancelled', 'woo-comprehensive-monitor'); ?></option>
                </select>
                <p class="description"><?php _e('When enabled, the price difference is automatically charged via saved payment method when a subscription status changes to "Cancelled".', 'woo-comprehensive-monitor'); ?></p>
            </td>
        </tr>
        <tr>
            <th scope="row"><?php _e('Customer Self-Service', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <select name="wcm_spd_customer_self_service">
                    <option value="yes" <?php selected($self_service, 'yes'); ?>><?php _e('Yes — Show "Convert to One-Time Purchase" on My Account', 'woo-comprehensive-monitor'); ?></option>
                    <option value="no" <?php selected($self_service, 'no'); ?>><?php _e('No — Admin-only', 'woo-comprehensive-monitor'); ?></option>
                </select>
                <p class="description"><?php _e('When enabled, customers see a "Convert to One-Time Purchase" section on their subscription detail page in My Account. They can pay the difference and convert voluntarily.', 'woo-comprehensive-monitor'); ?></p>
            </td>
        </tr>
    </table>

    <h3><?php _e('How It Works', 'woo-comprehensive-monitor'); ?></h3>
    <table class="form-table">
        <tr>
            <th scope="row"><?php _e('Admin Usage', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <ol style="margin:0;padding-left:20px;">
                    <li><?php _e('Go to any WooCommerce Subscription edit page', 'woo-comprehensive-monitor'); ?></li>
                    <li><?php _e('Look at the "Price Difference Charger" meta-box on the right', 'woo-comprehensive-monitor'); ?></li>
                    <li><?php _e('It shows the subscription price vs regular price breakdown', 'woo-comprehensive-monitor'); ?></li>
                    <li><?php _e('Click "Charge Difference" to create a charge order', 'woo-comprehensive-monitor'); ?></li>
                </ol>
            </td>
        </tr>
        <tr>
            <th scope="row"><?php _e('Subscription List', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <p><?php _e('A "Price Diff" column is added to the WooCommerce Subscriptions list table showing the uncharged difference amount or "Charged" status for each subscription.', 'woo-comprehensive-monitor'); ?></p>
            </td>
        </tr>
        <tr>
            <th scope="row"><?php _e('Supported Gateways', 'woo-comprehensive-monitor'); ?></th>
            <td>
                <p><?php _e('Payment is processed via the WooCommerce Subscriptions renewal hook, so it works with any compatible gateway: Stripe, PayPal, Square, Authorize.net, etc. If auto-charge fails, a pending order is created for manual payment.', 'woo-comprehensive-monitor'); ?></p>
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