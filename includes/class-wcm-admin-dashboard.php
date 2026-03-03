        }
        
        echo '</tbody></table>';
        
        echo '<p class="text-right"><a href="' . admin_url('admin.php?page=woo-comprehensive-monitor-disputes') . '">' . __('View all disputes', 'woo-comprehensive-monitor') . ' →</a></p>';
    }

    /**
     * Render health history
     */
    private function render_health_history() {
        $wcm = wcm();
        $health_logs = $wcm->get_health_monitor()->get_recent_health_logs(10);
        
        if (empty($health_logs)) {
            echo '<p>' . __('No health checks recorded yet.', 'woo-comprehensive-monitor') . '</p>';
            echo '<p><button type="button" class="button button-small" id="wcm-run-first-health-check">' . __('Run first health check', 'woo-comprehensive-monitor') . '</button></p>';
            return;
        }
        
        echo '<table class="wp-list-table widefat fixed striped">';
        echo '<thead><tr>';
        echo '<th>' . __('Date', 'woo-comprehensive-monitor') . '</th>';
        echo '<th>' . __('Check', 'woo-comprehensive-monitor') . '</th>';
        echo '<th>' . __('Status', 'woo-comprehensive-monitor') . '</th>';
        echo '</tr></thead>';
        echo '<tbody>';
        
        foreach ($health_logs as $log) {
            $details = json_decode($log->details, true);
            
            echo '<tr>';
            echo '<td>' . date_i18n(get_option('date_format'), strtotime($log->created_at)) . '</td>';
            echo '<td>' . esc_html($log->check_type) . '</td>';
            echo '<td>';
            switch ($log->status) {
                case 'good':
                    echo '<span class="dashicons dashicons-yes-alt" style="color: #4CAF50;"></span> ' . __('Good', 'woo-comprehensive-monitor');
                    break;
                case 'warning':
                    echo '<span class="dashicons dashicons-warning" style="color: #FF9800;"></span> ' . __('Warning', 'woo-comprehensive-monitor');
                    break;
                case 'critical':
                    echo '<span class="dashicons dashicons-dismiss" style="color: #F44336;"></span> ' . __('Critical', 'woo-comprehensive-monitor');
                    break;
            }
            echo '</td>';
            echo '</tr>';
        }
        
        echo '</tbody></table>';
        
        echo '<p class="text-right"><a href="' . admin_url('admin.php?page=woo-comprehensive-monitor-health') . '">' . __('View all health checks', 'woo-comprehensive-monitor') . ' →</a></p>';
    }

    /**
     * Render monitoring status
     */
    private function render_monitoring_status() {
        $monitoring_server = get_option('wcm_monitoring_server', 'https://woo.ashbi.ca/api/track-woo-error');
        $track_js_errors = get_option('wcm_track_js_errors', '1');
        $track_ajax_errors = get_option('wcm_track_ajax_errors', '1');
        $track_checkout_errors = get_option('wcm_track_checkout_errors', '1');
        $enable_dispute_protection = get_option('wcm_enable_dispute_protection', '1');
        $enable_health_monitoring = get_option('wcm_enable_health_monitoring', '1');
        
        ?>
        <ul class="wcm-status-list">
            <li>
                <span class="dashicons dashicons-admin-site-alt3"></span>
                <strong><?php _e('Monitoring Server:', 'woo-comprehensive-monitor'); ?></strong>
                <code><?php echo esc_html($monitoring_server); ?></code>
            </li>
            <li>
                <span class="dashicons dashicons-<?php echo $track_js_errors === '1' ? 'yes' : 'no'; ?>"></span>
                <?php _e('JavaScript Error Tracking', 'woo-comprehensive-monitor'); ?>
            </li>
            <li>
                <span class="dashicons dashicons-<?php echo $track_ajax_errors === '1' ? 'yes' : 'no'; ?>"></span>
                <?php _e('AJAX Error Tracking', 'woo-comprehensive-monitor'); ?>
            </li>
            <li>
                <span class="dashicons dashicons-<?php echo $track_checkout_errors === '1' ? 'yes' : 'no'; ?>"></span>
                <?php _e('Checkout Error Tracking', 'woo-comprehensive-monitor'); ?>
            </li>
            <li>
                <span class="dashicons dashicons-<?php echo $enable_dispute_protection === '1' ? 'yes' : 'no'; ?>"></span>
                <?php _e('Dispute Protection', 'woo-comprehensive-monitor'); ?>
            </li>
            <li>
                <span class="dashicons dashicons-<?php echo $enable_health_monitoring === '1' ? 'yes' : 'no'; ?>"></span>
                <?php _e('Health Monitoring', 'woo-comprehensive-monitor'); ?>
            </li>
        </ul>
        
        <style>
        .wcm-status-list {
            list-style: none;
            margin: 0;
            padding: 0;
        }
        .wcm-status-list li {
            padding: 8px 0;
            border-bottom: 1px solid #eee;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .wcm-status-list li:last-child {
            border-bottom: none;
        }
        .wcm-status-list .dashicons-yes {
            color: #4CAF50;
        }
        .wcm-status-list .dashicons-no {
            color: #F44336;
        }
        </style>
        <?php
    }

    /**
     * Render disputes page
     */
    public function render_disputes_page() {
        $wcm = wcm();
        $disputes = $wcm->get_dispute_manager()->get_disputes(100);
        
        ?>
        <div class="wrap">
            <h1><?php _e('Dispute Management', 'woo-comprehensive-monitor'); ?></h1>
            
            <div class="wcm-disputes-header">
                <p><?php _e('View and manage Stripe disputes with automatically generated evidence.', 'woo-comprehensive-monitor'); ?></p>
                
                <div class="tablenav top">
                    <div class="alignleft actions">
                        <button type="button" class="button" onclick="jQuery('#wcm-check-disputes').trigger('click')">
                            <span class="dashicons dashicons-update"></span>
                            <?php _e('Check for New Disputes', 'woo-comprehensive-monitor'); ?>
                        </button>
                    </div>
                </div>
            </div>
            
            <?php if (empty($disputes)) : ?>
                <div class="notice notice-info">
                    <p><?php _e('No disputes recorded yet. Disputes will appear here when they are detected via Stripe webhooks.', 'woo-comprehensive-monitor'); ?></p>
                </div>
            <?php else : ?>
                <table class="wp-list-table widefat fixed striped">
                    <thead>
                        <tr>
                            <th><?php _e('Dispute ID', 'woo-comprehensive-monitor'); ?></th>
                            <th><?php _e('Order', 'woo-comprehensive-monitor'); ?></th>
                            <th><?php _e('Customer', 'woo-comprehensive-monitor'); ?></th>
                            <th><?php _e('Evidence Type', 'woo-comprehensive-monitor'); ?></th>
                            <th><?php _e('Created', 'woo-comprehensive-monitor'); ?></th>
                            <th><?php _e('Actions', 'woo-comprehensive-monitor'); ?></th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($disputes as $dispute) : 
                            $evidence = json_decode($dispute->evidence_data, true);
                            $order = wc_get_order($dispute->order_id);
                        ?>
                        <tr>
                            <td><code><?php echo esc_html($dispute->dispute_id); ?></code></td>
                            <td>
                                <?php if ($order) : ?>
                                    <a href="<?php echo admin_url('post.php?post=' . $order->get_id() . '&action=edit'); ?>">
                                        #<?php echo $order->get_id(); ?> - <?php echo $order->get_billing_first_name() . ' ' . $order->get_billing_last_name(); ?>
                                    </a>
                                <?php else : ?>
                                    Order #<?php echo $dispute->order_id; ?>
                                <?php endif; ?>
                            </td>
                            <td><?php echo esc_html($dispute->customer_email); ?></td>
                            <td><?php echo esc_html($dispute->evidence_type); ?></td>
                            <td><?php echo date_i18n(get_option('date_format') . ' ' . get_option('time_format'), strtotime($dispute->created_at)); ?></td>
                            <td>
                                <button type="button" class="button button-small" onclick="wcmViewEvidence(<?php echo $dispute->id; ?>)">
                                    <?php _e('View Evidence', 'woo-comprehensive-monitor'); ?>
                                </button>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>
        </div>
        
        <script>
        function wcmViewEvidence(evidenceId) {
            // This would open a modal with the evidence details
            alert('Evidence details would appear here for ID: ' + evidenceId);
        }
        </script>
        <?php
    }

    /**
     * Render errors page
     */
    public function render_errors_page() {
        $wcm = wcm();
        $errors = $wcm->get_error_tracker()->get_recent_errors(100);
        $error_stats = $wcm->get_error_tracker()->get_error_stats(30);
        
        ?>
        <div class="wrap">
            <h1><?php _e('Error Logs', 'woo-comprehensive-monitor'); ?></h1>
            
            <div class="wcm-errors-header">
                <div class="wcm-error-stats">
                    <div class="stat">
                        <span class="stat-value"><?php echo $error_stats['total_errors']; ?></span>
                        <span class="stat-label"><?php _e('Total Errors (30 days)', 'woo-comprehensive-monitor'); ?></span>
                    </div>
                    <div class="stat">
                        <span class="stat-value"><?php echo isset($error_stats['by_type']['checkout_error']) ? $error_stats['by_type']['checkout_error'] : 0; ?></span>
                        <span class="stat-label"><?php _e('Checkout Errors', 'woo-comprehensive-monitor'); ?></span>
                    </div>
                    <div class="stat">
                        <span class="stat-value"><?php echo isset($error_stats['by_type']['javascript_error']) ? $error_stats['by_type']['javascript_error'] : 0; ?></span>
                        <span class="stat-label"><?php _e('JavaScript Errors', 'woo-comprehensive-monitor'); ?></span>
                    </div>
                </div>
                
                <div class="tablenav top">
                    <div class="alignleft actions">
                        <button type="button" class="button" onclick="if(confirm('<?php _e('Are you sure you want to clear all error logs?', 'woo-comprehensive-monitor'); ?>')) jQuery('#wcm-clear-logs').trigger('click')">
                            <span class="dashicons dashicons-trash"></span>
                            <?php _e('Clear All Logs', 'woo-comprehensive-monitor'); ?>
                        </button>
                    </div>
                </div>
            </div>
            
            <?php if (empty($errors)) : ?>
                <div class="notice notice-info">
                    <p><?php _e('No errors recorded yet. Errors will appear here when they are detected on your store.', 'woo-comprehensive-monitor'); ?></p>
                </div>
            <?php else : ?>
                <table class="wp-list-table widefat fixed striped">
                    <thead>
                        <tr>
                            <th><?php _e('Time', 'woo-comprehensive-monitor'); ?></th>
                            <th><?php _e('Type', 'woo-comprehensive-monitor'); ?></th>
                            <th><?php _e('Message', 'woo-comprehensive-monitor'); ?></th>
                            <th><?php _e('Page', 'woo-comprehensive-monitor'); ?></th>
                            <th><?php _e('Customer', 'woo-comprehensive-monitor'); ?></th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($errors as $error) : ?>
                        <tr>
                            <td><?php echo date_i18n(get_option('date_format') . ' ' . get_option('time_format'), strtotime($error->created_at)); ?></td>
                            <td><code><?php echo esc_html($error->error_type); ?></code></td>
                            <td><?php echo esc_html($error->error_message); ?></td>
                            <td><?php echo esc_html($error->page_url); ?></td>
                            <td><?php echo esc_html($error->customer_email); ?></td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>
        </div>
        
        <style>
        .wcm-error-stats {
            display: flex;
            gap: 30px;
            margin: 20px 0;
        }
        .wcm-error-stats .stat {
            text-align: center;
            padding: 15px;
            background: #f5f5f5;
            border-radius: 4px;
            min-width: 120px;
        }
        .wcm-error-stats .stat-value {
            display: block;
            font-size: 28px;
            font-weight: bold;
            color: #333;
        }
        .wcm-error-stats .stat-label {
            display: block;
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
        }
        </style>
        <?php
    }

    /**
     * Render health page
     */
    public function render_health_page() {
        $wcm = wcm();
        $health_score = $wcm->get_health_monitor()->get_health_score();
        $health_stats = $wcm->get_health_monitor()->get_health_stats(30);
        $health_logs = $wcm->get_health_monitor()->get_recent_health_logs(100);
        
        ?>
        <div class="wrap">
            <h1><?php _e('Health Checks', 'woo-comprehensive-monitor'); ?></h1>
            
            <div class="wcm-health-header">
                <div class="wcm-health-score-card">
                    <div class="score-circle-medium" data-score="<?php echo esc_attr($health_score['score']); ?>">
                        <span class="score"><?php echo esc_html($health_score['score']); ?></span>
                        <span class="label">/100</span>
                    </div>
                    <div class="health-score-details">
                        <h3><?php _e('Overall Health Score', 'woo-comprehensive-monitor'); ?></h3>
                        <p><?php printf(__('Based on %d health checks in the last 30 days.', 'woo-comprehensive-monitor'), $health_stats['total_checks']); ?></p>
                    </div>
                </div>
                
                <div class="wcm-health-stats">
                    <div class="stat">
                        <span class="stat-value" style="color: #4CAF50;"><?php echo $health_stats['by_status']['good'] ?? 0; ?></span>
                        <span class="stat-label"><?php _e('Good Checks', 'woo-comprehensive-monitor'); ?></span>
                    </div>
                    <div class="stat">
                        <span class="stat-value" style="color: #FF9800;"><?php echo $health_stats['by_status']['warning'] ?? 0; ?></span>
                        <span class="stat-label"><?php _e('Warnings', 'woo-comprehensive-monitor'); ?></span>
                    </div>
                    <div class="stat">
                        <span class="stat-value" style="color: #F44336;"><?php echo $health_stats['by_status']['critical'] ?? 0; ?></span>
                        <span class="stat-label"><?php _e('Critical Issues', 'woo-comprehensive-monitor'); ?></span>
                    </div>
                </div>
            </div>
            
            <div class="wcm-health-actions">
                <button type="button" class="button button-primary" id="wcm-run-health-check-now">
                    <span class="dashicons dashicons-update"></span>
                    <?php _e('Run Health Check Now', 'woo-comprehensive-monitor'); ?>
                </button>
                <a href="<?php echo admin_url('admin.php?page=woo-comprehensive-monitor-settings&tab=health'); ?>" class="button">
                    <span class="dashicons dashicons-admin-generic"></span>
                    <?php _e('Health Check Settings', 'woo-comprehensive-monitor'); ?>
                </a>
            </div>
            
            <h2><?php _e('Recent Health Checks', 'woo-comprehensive-monitor'); ?></h2>
            
            <?php if (empty($health_logs)) : ?>
                <div class="notice notice-info">
                    <p><?php _e('No health checks recorded yet. Run your first health check to see results here.', 'woo-comprehensive-monitor'); ?></p>
                </div>
            <?php else