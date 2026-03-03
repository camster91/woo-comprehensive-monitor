) {
                                    case 'good':
                                        echo '<span class="dashicons dashicons-yes-alt" style="color: #4CAF50;"></span> ' . __('Good', 'woo-comprehensive-monitor');
                                        break;
                                    case 'warning':
                                        echo '<span class="dashicons dashicons-warning" style="color: #FF9800;"></span> ' . __('Warning', 'woo-comprehensive-monitor');
                                        break;
                                    case 'critical':
                                        echo '<span class="dashicons dashicons-dismiss" style="color: #F44336;"></span> ' . __('Critical', 'woo-comprehensive-monitor');
                                        break;
                                } ?>
                            </td>
                            <td>
                                <?php if (is_array($details) && !empty($details)) : ?>
                                    <button type="button" class="button button-small" onclick="wcmViewHealthDetails(<?php echo $log->id; ?>)">
                                        <?php _e('View Details', 'woo-comprehensive-monitor'); ?>
                                    </button>
                                <?php endif; ?>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>
        </div>
        
        <script>
        function wcmViewHealthDetails(logId) {
            // This would open a modal with the health check details
            alert('Health check details would appear here for ID: ' + logId);
        }
        </script>
        <?php
    }

    /**
     * AJAX: Run health check
     */
    public function ajax_run_health_check() {
        check_ajax_referer('wcm_admin_nonce', 'nonce');
        
        if (!current_user_can('manage_woocommerce')) {
            wp_die('Unauthorized');
        }
        
        $wcm = wcm();
        $results = $wcm->get_health_monitor()->run_health_check();
        
        wp_send_json_success(array(
            'message' => __('Health check completed successfully.', 'woo-comprehensive-monitor'),
            'results' => $results,
        ));
    }

    /**
     * AJAX: Clear error logs
     */
    public function ajax_clear_error_logs() {
        check_ajax_referer('wcm_admin_nonce', 'nonce');
        
        if (!current_user_can('manage_woocommerce')) {
            wp_die('Unauthorized');
        }
        
        $wcm = wcm();
        $result = $wcm->get_error_tracker()->clear_error_logs();
        
        if ($result) {
            wp_send_json_success(array(
                'message' => __('Error logs cleared successfully.', 'woo-comprehensive-monitor'),
            ));
        } else {
            wp_send_json_error('Failed to clear error logs');
        }
    }

    /**
     * AJAX: Check for disputes
     */
    public function ajax_check_disputes() {
        check_ajax_referer('wcm_admin_nonce', 'nonce');
        
        if (!current_user_can('manage_woocommerce')) {
            wp_die('Unauthorized');
        }
        
        $wcm = wcm();
        $result = $wcm->get_dispute_manager()->check_for_disputes();
        
        wp_send_json_success(array(
            'message' => __('Dispute check completed.', 'woo-comprehensive-monitor'),
            'found' => $result,
        ));
    }
}