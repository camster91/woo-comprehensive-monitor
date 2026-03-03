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
                        <?php _e('The web