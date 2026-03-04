<?php
/**
 * Admin Dashboard - Provides the admin UI for monitoring, disputes, and acknowledgments
 *
 * @package WooComprehensiveMonitor
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WCM_Admin_Dashboard {

    public function __construct() {
        $this->init_hooks();
    }

    private function init_hooks() {
        add_action( 'admin_menu', array( $this, 'add_admin_menu' ) );
        add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_admin_scripts' ) );
        add_action( 'wp_ajax_wcm_run_health_check', array( $this, 'ajax_run_health_check' ) );
        add_action( 'wp_ajax_wcm_clear_error_logs', array( $this, 'ajax_clear_error_logs' ) );
        add_action( 'wp_ajax_wcm_check_disputes', array( $this, 'ajax_check_disputes' ) );
        add_action( 'wp_ajax_wcm_generate_evidence', array( $this, 'ajax_generate_evidence' ) );
        add_action( 'wp_ajax_wcm_create_dispute', array( $this, 'ajax_create_dispute' ) );
        add_action( 'wp_ajax_wcm_update_dispute_status', array( $this, 'ajax_update_dispute_status' ) );
        add_action( 'wp_ajax_wcm_test_stripe', array( $this, 'ajax_test_stripe' ) );
    }

    public function add_admin_menu() {
        add_menu_page(
            __( 'WC Monitor', 'woo-comprehensive-monitor' ),
            __( 'WC Monitor', 'woo-comprehensive-monitor' ),
            'manage_woocommerce',
            'woo-comprehensive-monitor',
            array( $this, 'render_dashboard_page' ),
            'dashicons-shield',
            58
        );

        add_submenu_page( 'woo-comprehensive-monitor', __( 'Dashboard', 'woo-comprehensive-monitor' ), __( 'Dashboard', 'woo-comprehensive-monitor' ), 'manage_woocommerce', 'woo-comprehensive-monitor', array( $this, 'render_dashboard_page' ) );
        add_submenu_page( 'woo-comprehensive-monitor', __( 'Error Logs', 'woo-comprehensive-monitor' ), __( 'Error Logs', 'woo-comprehensive-monitor' ), 'manage_woocommerce', 'wcm-error-logs', array( $this, 'render_error_logs_page' ) );
        add_submenu_page( 'woo-comprehensive-monitor', __( 'Disputes', 'woo-comprehensive-monitor' ), __( 'Disputes', 'woo-comprehensive-monitor' ), 'manage_woocommerce', 'wcm-disputes', array( $this, 'render_disputes_page' ) );
        add_submenu_page( 'woo-comprehensive-monitor', __( 'Acknowledgments', 'woo-comprehensive-monitor' ), __( 'Acknowledgments', 'woo-comprehensive-monitor' ), 'manage_woocommerce', 'wcm-acknowledgments', array( $this, 'render_acknowledgments_page' ) );
        add_submenu_page( 'woo-comprehensive-monitor', __( 'Price Protection', 'woo-comprehensive-monitor' ), __( 'Price Protection', 'woo-comprehensive-monitor' ), 'manage_woocommerce', 'wcm-recovery', array( $this, 'render_recovery_page' ) );
        add_submenu_page( 'woo-comprehensive-monitor', __( 'Pre-Orders', 'woo-comprehensive-monitor' ), __( 'Pre-Orders', 'woo-comprehensive-monitor' ), 'manage_woocommerce', 'wcm-preorders', array( $this, 'render_preorders_page' ) );
        add_submenu_page( 'woo-comprehensive-monitor', __( 'Health Checks', 'woo-comprehensive-monitor' ), __( 'Health Checks', 'woo-comprehensive-monitor' ), 'manage_woocommerce', 'wcm-health', array( $this, 'render_health_page' ) );
        add_submenu_page( 'woo-comprehensive-monitor', __( 'Settings', 'woo-comprehensive-monitor' ), __( 'Settings', 'woo-comprehensive-monitor' ), 'manage_woocommerce', 'woo-comprehensive-monitor-settings', 'wcm_render_settings_page' );
    }

    public function enqueue_admin_scripts( $hook ) {
        if ( strpos( $hook, 'woo-comprehensive-monitor' ) === false && strpos( $hook, 'wcm-' ) === false ) {
            return;
        }

        wp_enqueue_style( 'wcm-admin', WCM_PLUGIN_URL . 'assets/css/admin.css', array(), WCM_VERSION );
        wp_enqueue_script( 'wcm-admin', WCM_PLUGIN_URL . 'assets/js/admin.js', array( 'jquery' ), WCM_VERSION, true );

        wp_localize_script( 'wcm-admin', 'wcm_ajax', array(
            'ajax_url' => admin_url( 'admin-ajax.php' ),
            'nonce'    => wp_create_nonce( 'wcm_admin_nonce' ),
        ) );
    }

    // ==========================================
    // DASHBOARD PAGE
    // ==========================================
    public function render_dashboard_page() {
        $health_score = get_option( 'wcm_health_score', 100 );
        $health_updated = get_option( 'wcm_health_score_updated', '' );
        $store_id = get_option( 'wcm_store_id', '' );

        global $wpdb;
        $error_count   = $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}wcm_error_logs" );
        $dispute_count = $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}wcm_dispute_evidence" );
        $ack_table     = $wpdb->prefix . 'woo_subscription_acknowledgments';
        $ack_count     = $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $ack_table ) ) ? $wpdb->get_var( "SELECT COUNT(*) FROM {$ack_table}" ) : 0;

        // Subscription protection stats
        $protection = WCM_Subscription_Protector::get_instance()->get_stats();

        // Pre-order stats
        $preorder = WCM_PreOrder::get_instance()->get_preorder_stats();
        ?>
        <div class="wrap wcm-admin">
            <h1><?php esc_html_e( 'WooCommerce Monitor Dashboard', 'woo-comprehensive-monitor' ); ?></h1>

            <div class="wcm-dashboard-stats">
                <div class="wcm-stat-card">
                    <h3><?php esc_html_e( 'Health Score', 'woo-comprehensive-monitor' ); ?></h3>
                    <p class="wcm-stat-number" style="color: <?php echo $health_score >= 80 ? '#4CAF50' : ( $health_score >= 50 ? '#FF9800' : '#F44336' ); ?>">
                        <?php echo esc_html( $health_score ); ?>%
                    </p>
                </div>
                <div class="wcm-stat-card">
                    <h3><?php esc_html_e( 'Error Logs', 'woo-comprehensive-monitor' ); ?></h3>
                    <p class="wcm-stat-number"><?php echo esc_html( $error_count ); ?></p>
                </div>
                <div class="wcm-stat-card">
                    <h3><?php esc_html_e( 'Disputes', 'woo-comprehensive-monitor' ); ?></h3>
                    <p class="wcm-stat-number"><?php echo esc_html( $dispute_count ); ?></p>
                </div>
                <div class="wcm-stat-card">
                    <h3><?php esc_html_e( 'Acknowledgments', 'woo-comprehensive-monitor' ); ?></h3>
                    <p class="wcm-stat-number"><?php echo esc_html( $ack_count ); ?></p>
                </div>
                <div class="wcm-stat-card">
                    <h3><?php esc_html_e( 'Price Protected', 'woo-comprehensive-monitor' ); ?></h3>
                    <p class="wcm-stat-number" style="font-size:24px;"><?php echo wc_price( $protection['total_amount'] ); ?></p>
                </div>
                <div class="wcm-stat-card">
                    <h3><?php esc_html_e( 'Pre-Orders', 'woo-comprehensive-monitor' ); ?></h3>
                    <p class="wcm-stat-number"><?php echo esc_html( $preorder['pre_ordered'] ); ?></p>
                </div>
            </div>

            <div class="wcm-quick-actions">
                <h2><?php esc_html_e( 'Quick Actions', 'woo-comprehensive-monitor' ); ?></h2>
                <div class="wcm-action-buttons">
                    <button type="button" class="button button-primary" id="wcm-run-health-check">
                        <?php esc_html_e( 'Run Health Check', 'woo-comprehensive-monitor' ); ?>
                    </button>
                    <a href="<?php echo esc_url( admin_url( 'admin.php?page=wcm-disputes' ) ); ?>" class="button"><?php esc_html_e( 'Manage Disputes', 'woo-comprehensive-monitor' ); ?></a>
                    <a href="<?php echo esc_url( admin_url( 'admin.php?page=wcm-error-logs' ) ); ?>" class="button"><?php esc_html_e( 'View Errors', 'woo-comprehensive-monitor' ); ?></a>
                    <a href="<?php echo esc_url( admin_url( 'admin.php?page=woo-comprehensive-monitor-settings' ) ); ?>" class="button"><?php esc_html_e( 'Settings', 'woo-comprehensive-monitor' ); ?></a>
                </div>
                <span id="wcm-action-result" style="margin-left: 10px;"></span>
            </div>

            <?php if ( $store_id ) : ?>
            <div class="wcm-info-box">
                <p><strong><?php esc_html_e( 'Store ID:', 'woo-comprehensive-monitor' ); ?></strong> <code><?php echo esc_html( $store_id ); ?></code></p>
                <p><strong><?php esc_html_e( 'Monitoring Server:', 'woo-comprehensive-monitor' ); ?></strong> <code><?php echo esc_html( get_option( 'wcm_monitoring_server', '' ) ); ?></code></p>
                <?php if ( $health_updated ) : ?>
                <p><strong><?php esc_html_e( 'Last Health Check:', 'woo-comprehensive-monitor' ); ?></strong> <?php echo esc_html( $health_updated ); ?></p>
                <?php endif; ?>
            </div>
            <?php endif; ?>
        </div>
        <?php
    }

    // ==========================================
    // ERROR LOGS PAGE
    // ==========================================
    public function render_error_logs_page() {
        $wcm    = wcm();
        $errors = $wcm->get_error_tracker()->get_recent_errors( 100 );
        ?>
        <div class="wrap wcm-admin">
            <h1><?php esc_html_e( 'Error Logs', 'woo-comprehensive-monitor' ); ?></h1>
            <p>
                <button type="button" class="button" id="wcm-clear-errors"><?php esc_html_e( 'Clear All Logs', 'woo-comprehensive-monitor' ); ?></button>
                <span id="wcm-clear-result" style="margin-left: 10px;"></span>
            </p>

            <?php if ( ! empty( $errors ) ) : ?>
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th><?php esc_html_e( 'Type', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Message', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Page', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Date', 'woo-comprehensive-monitor' ); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ( $errors as $error ) : ?>
                    <tr>
                        <td><code><?php echo esc_html( $error->error_type ); ?></code></td>
                        <td><?php echo esc_html( wp_trim_words( $error->error_message, 20 ) ); ?></td>
                        <td><a href="<?php echo esc_url( $error->page_url ); ?>" target="_blank"><?php echo esc_html( wp_trim_words( $error->page_url, 5 ) ); ?></a></td>
                        <td><?php echo esc_html( $error->created_at ); ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            <?php else : ?>
            <p><?php esc_html_e( 'No errors recorded.', 'woo-comprehensive-monitor' ); ?></p>
            <?php endif; ?>
        </div>
        <?php
    }

    // ==========================================
    // DISPUTES PAGE
    // ==========================================
    public function render_disputes_page() {
        global $wpdb;
        $table_name = $wpdb->prefix . 'wcm_dispute_evidence';
        $disputes   = $wpdb->get_results( "SELECT * FROM {$table_name} ORDER BY created_at DESC LIMIT 50" );
        ?>
        <div class="wrap wcm-admin">
            <h1><?php esc_html_e( 'Dispute Evidence Management', 'woo-comprehensive-monitor' ); ?></h1>

            <?php if ( ! empty( $disputes ) ) : ?>
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th><?php esc_html_e( 'ID', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Order', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Customer', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Stripe Dispute', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Status', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Date', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Actions', 'woo-comprehensive-monitor' ); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ( $disputes as $dispute ) : ?>
                    <tr>
                        <td><?php echo esc_html( $dispute->id ); ?></td>
                        <td><?php
                $order = wc_get_order( $dispute->order_id );
                if ( $order ) {
                    printf( '<a href="%s">#%s</a>', esc_url( $order->get_edit_order_url() ), esc_html( $dispute->order_id ) );
                } else {
                    echo '#' . esc_html( $dispute->order_id );
                }
            ?></td>
                        <td><?php echo esc_html( $dispute->customer_email ); ?></td>
                        <td><?php echo $dispute->stripe_dispute_id ? esc_html( $dispute->stripe_dispute_id ) : '—'; ?></td>
                        <td><span class="wcm-status-badge wcm-status-<?php echo esc_attr( $dispute->status ); ?>"><?php echo esc_html( ucfirst( str_replace( '_', ' ', $dispute->status ) ) ); ?></span></td>
                        <td><?php echo esc_html( date_i18n( get_option( 'date_format' ), strtotime( $dispute->created_at ) ) ); ?></td>
                        <td>
                            <?php if ( ! empty( $dispute->evidence_file_url ) ) : ?>
                                <a href="<?php echo esc_url( $dispute->evidence_file_url ); ?>" class="button button-small" download><?php esc_html_e( 'Download', 'woo-comprehensive-monitor' ); ?></a>
                            <?php else : ?>
                                <button class="button button-small wcm-generate-evidence" data-dispute-id="<?php echo esc_attr( $dispute->id ); ?>"><?php esc_html_e( 'Generate', 'woo-comprehensive-monitor' ); ?></button>
                            <?php endif; ?>
                            <button class="button button-small wcm-update-status" data-dispute-id="<?php echo esc_attr( $dispute->id ); ?>" data-current-status="<?php echo esc_attr( $dispute->status ); ?>"><?php esc_html_e( 'Status', 'woo-comprehensive-monitor' ); ?></button>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            <?php else : ?>
            <p><?php esc_html_e( 'No disputes recorded.', 'woo-comprehensive-monitor' ); ?></p>
            <?php endif; ?>

            <!-- Status modal -->
            <div id="wcm-status-modal" class="wcm-modal" style="display:none;">
                <div class="wcm-modal-content">
                    <span class="wcm-modal-close">&times;</span>
                    <h2><?php esc_html_e( 'Update Dispute Status', 'woo-comprehensive-monitor' ); ?></h2>
                    <select id="wcm-new-status">
                        <option value="pending"><?php esc_html_e( 'Pending', 'woo-comprehensive-monitor' ); ?></option>
                        <option value="evidence_generated"><?php esc_html_e( 'Evidence Generated', 'woo-comprehensive-monitor' ); ?></option>
                        <option value="submitted"><?php esc_html_e( 'Submitted', 'woo-comprehensive-monitor' ); ?></option>
                        <option value="won"><?php esc_html_e( 'Won', 'woo-comprehensive-monitor' ); ?></option>
                        <option value="lost"><?php esc_html_e( 'Lost', 'woo-comprehensive-monitor' ); ?></option>
                    </select>
                    <div class="wcm-modal-buttons">
                        <button id="wcm-save-status" class="button button-primary"><?php esc_html_e( 'Save', 'woo-comprehensive-monitor' ); ?></button>
                        <button class="button wcm-modal-cancel"><?php esc_html_e( 'Cancel', 'woo-comprehensive-monitor' ); ?></button>
                    </div>
                    <input type="hidden" id="wcm-modal-dispute-id" value="" />
                </div>
            </div>

            <div class="wcm-manual-evidence">
                <h2><?php esc_html_e( 'Manual Evidence Generation', 'woo-comprehensive-monitor' ); ?></h2>
                <form id="wcm-manual-evidence-form">
                    <table class="form-table">
                        <tr>
                            <th><label for="manual_order_id"><?php esc_html_e( 'Order ID', 'woo-comprehensive-monitor' ); ?></label></th>
                            <td><input type="number" id="manual_order_id" name="order_id" class="regular-text" /></td>
                        </tr>
                        <tr>
                            <th><label for="manual_dispute_id"><?php esc_html_e( 'Stripe Dispute ID (Optional)', 'woo-comprehensive-monitor' ); ?></label></th>
                            <td><input type="text" id="manual_dispute_id" name="stripe_dispute_id" class="regular-text" /></td>
                        </tr>
                    </table>
                    <?php submit_button( __( 'Generate Evidence', 'woo-comprehensive-monitor' ), 'primary', 'generate_evidence' ); ?>
                </form>
            </div>
        </div>
        <?php
    }

    // ==========================================
    // ACKNOWLEDGMENTS PAGE
    // ==========================================
    public function render_acknowledgments_page() {
        global $wpdb;
        $table_name = $wpdb->prefix . 'woo_subscription_acknowledgments';

        // Check table exists
        if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table_name ) ) !== $table_name ) {
            echo '<div class="wrap"><h1>' . esc_html__( 'Subscription Acknowledgments', 'woo-comprehensive-monitor' ) . '</h1>';
            echo '<p>' . esc_html__( 'Acknowledgments table not found. Please deactivate and reactivate the plugin.', 'woo-comprehensive-monitor' ) . '</p></div>';
            return;
        }

        $acks = $wpdb->get_results( "SELECT * FROM {$table_name} ORDER BY created_at DESC LIMIT 100" );
        ?>
        <div class="wrap wcm-admin">
            <h1><?php esc_html_e( 'Subscription Acknowledgments', 'woo-comprehensive-monitor' ); ?></h1>
            <?php if ( ! empty( $acks ) ) : ?>
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th><?php esc_html_e( 'Order', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Customer', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'IP Address', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Date', 'woo-comprehensive-monitor' ); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ( $acks as $ack ) :
                        $order = wc_get_order( $ack->order_id );
                    ?>
                    <tr>
                        <td><a href="<?php echo esc_url( $order ? $order->get_edit_order_url() : '#' ); ?>">#<?php echo esc_html( $ack->order_id ); ?></a></td>
                        <td><?php echo $order ? esc_html( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() ) : '—'; ?></td>
                        <td><?php echo esc_html( $ack->ip_address ); ?></td>
                        <td><?php echo esc_html( date_i18n( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), strtotime( $ack->created_at ) ) ); ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            <?php else : ?>
            <p><?php esc_html_e( 'No acknowledgments recorded yet.', 'woo-comprehensive-monitor' ); ?></p>
            <?php endif; ?>
        </div>
        <?php
    }

    // ==========================================
    // HEALTH PAGE
    // ==========================================
    public function render_health_page() {
        $wcm  = wcm();
        $logs  = $wcm->get_health_monitor()->get_recent_health_logs( 50 );
        $score = $wcm->get_health_monitor()->get_health_score();
        ?>
        <div class="wrap wcm-admin">
            <h1><?php esc_html_e( 'Health Checks', 'woo-comprehensive-monitor' ); ?></h1>
            <p>
                <button type="button" class="button button-primary" id="wcm-run-health-check"><?php esc_html_e( 'Run Health Check Now', 'woo-comprehensive-monitor' ); ?></button>
                <span id="wcm-action-result" style="margin-left: 10px;"></span>
            </p>
            <p><strong><?php esc_html_e( 'Current Score:', 'woo-comprehensive-monitor' ); ?></strong> <?php echo esc_html( $score['score'] ); ?>%
                <?php if ( $score['updated'] ) : ?> (<?php echo esc_html( $score['updated'] ); ?>)<?php endif; ?>
            </p>

            <?php if ( ! empty( $logs ) ) : ?>
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th><?php esc_html_e( 'Check', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Status', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Date', 'woo-comprehensive-monitor' ); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ( $logs as $log ) : ?>
                    <tr>
                        <td><?php echo esc_html( $log->check_type ); ?></td>
                        <td>
                            <?php
                            switch ( $log->status ) {
                                case 'good':
                                    echo '<span style="color:#4CAF50;">✅ Good</span>';
                                    break;
                                case 'warning':
                                    echo '<span style="color:#FF9800;">⚠️ Warning</span>';
                                    break;
                                case 'critical':
                                    echo '<span style="color:#F44336;">❌ Critical</span>';
                                    break;
                            }
                            ?>
                        </td>
                        <td><?php echo esc_html( $log->created_at ); ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            <?php else : ?>
            <p><?php esc_html_e( 'No health checks run yet.', 'woo-comprehensive-monitor' ); ?></p>
            <?php endif; ?>
        </div>
        <?php
    }

    // ==========================================
    // RECOVERY LOG PAGE
    // ==========================================
    public function render_recovery_page() {
        $protector = WCM_Subscription_Protector::get_instance();
        $stats     = $protector->get_stats();
        ?>
        <div class="wrap wcm-admin">
            <h1><?php esc_html_e( 'Subscription Price Protection', 'woo-comprehensive-monitor' ); ?></h1>

            <div class="wcm-dashboard-stats">
                <div class="wcm-stat-card"><h3><?php esc_html_e( 'Total', 'woo-comprehensive-monitor' ); ?></h3><p class="wcm-stat-number"><?php echo esc_html( $stats['total'] ); ?></p></div>
                <div class="wcm-stat-card"><h3><?php esc_html_e( 'Charged', 'woo-comprehensive-monitor' ); ?></h3><p class="wcm-stat-number" style="color:#4CAF50;"><?php echo esc_html( $stats['charged'] ); ?></p></div>
                <div class="wcm-stat-card"><h3><?php esc_html_e( 'Pending', 'woo-comprehensive-monitor' ); ?></h3><p class="wcm-stat-number" style="color:#FF9800;"><?php echo esc_html( $stats['pending'] ); ?></p></div>
                <div class="wcm-stat-card"><h3><?php esc_html_e( 'Protected Revenue', 'woo-comprehensive-monitor' ); ?></h3><p class="wcm-stat-number" style="color:#4CAF50;font-size:24px;"><?php echo wc_price( $stats['total_amount'] ); ?></p></div>
            </div>

            <div class="wcm-info-box">
                <h3><?php esc_html_e( 'How It Works', 'woo-comprehensive-monitor' ); ?></h3>
                <p><?php esc_html_e( 'When a customer cancels their subscription or converts to a one-time purchase, the system finds the correct one-time product price and charges the difference. This prevents customers from subscribing just to get a discount.', 'woo-comprehensive-monitor' ); ?></p>
                <p><?php esc_html_e( 'Set the one-time price on your products under Product → Pricing → "One-Time Price" or link to a one-time variation. If not set, the charge is skipped — no guessing from regular prices.', 'woo-comprehensive-monitor' ); ?></p>
            </div>

            <?php
            global $wpdb;
            $log_table = $wpdb->prefix . 'wcm_recovery_log';
            $logs = $wpdb->get_results( "SELECT * FROM {$log_table} ORDER BY created_at DESC LIMIT 50" );
            ?>
            <?php if ( ! empty( $logs ) ) : ?>
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th><?php esc_html_e( 'Date', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Subscription', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Customer', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'One-Time Price', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Paid', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Difference', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Trigger', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Status', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Order', 'woo-comprehensive-monitor' ); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ( $logs as $log ) :
                        $customer = get_userdata( $log->customer_id );
                        $trigger_labels = array( 'cancel_auto' => '🔄 Auto', 'convert_customer' => '🧑 Customer', 'admin_manual' => '👤 Admin' );
                        $trigger_label = $trigger_labels[ $log->charge_type ?? '' ] ?? esc_html( $log->notes );
                    ?>
                    <tr>
                        <td><?php echo esc_html( date_i18n( get_option( 'date_format' ), strtotime( $log->created_at ) ) ); ?></td>
                        <td>#<?php echo esc_html( $log->subscription_id ); ?></td>
                        <td><?php echo $customer ? esc_html( $customer->display_name ) : '#' . esc_html( $log->customer_id ); ?></td>
                        <td><?php echo wc_price( $log->regular_total ); ?></td>
                        <td><?php echo wc_price( $log->subscription_total ); ?></td>
                        <td><strong><?php echo wc_price( $log->discount_amount ); ?></strong></td>
                        <td><?php echo $trigger_label; ?></td>
                        <td>
                            <?php
                            $colors = array( 'charged' => '#4CAF50', 'pending' => '#FF9800', 'failed' => '#F44336' );
                            $color  = $colors[ $log->charge_status ] ?? '#666';
                            printf( '<span style="color:%s;font-weight:bold;">%s</span>', esc_attr( $color ), esc_html( ucfirst( $log->charge_status ) ) );
                            ?>
                        </td>
                        <td>
                            <?php if ( $log->recovery_order_id ) : ?>
                                <?php
                                    $recovery_order = $log->recovery_order_id ? wc_get_order( $log->recovery_order_id ) : null;
                                    if ( $recovery_order ) {
                                        printf( '<a href="%s">#%s</a>', esc_url( $recovery_order->get_edit_order_url() ), esc_html( $log->recovery_order_id ) );
                                    } else {
                                        echo '#' . esc_html( $log->recovery_order_id );
                                    }
                                ?>
                            <?php else : ?>—<?php endif; ?>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            <?php else : ?>
            <p><?php esc_html_e( 'No price adjustments yet. When customers cancel or convert subscriptions, charges will appear here.', 'woo-comprehensive-monitor' ); ?></p>
            <?php endif; ?>
        </div>
        <?php
    }

    // ==========================================
    // PRE-ORDERS PAGE
    // ==========================================
    public function render_preorders_page() {
        $preorder = WCM_PreOrder::get_instance();
        $stats    = $preorder->get_preorder_stats();

        // Get pre-ordered orders
        $args = array(
            'status' => array( 'pre-ordered', 'pre-order-fail' ),
            'limit'  => 50,
            'orderby' => 'date',
            'order'   => 'DESC',
        );
        $orders = wc_get_orders( $args );
        ?>
        <div class="wrap wcm-admin">
            <h1><?php esc_html_e( 'Pre-Orders', 'woo-comprehensive-monitor' ); ?></h1>

            <div class="wcm-dashboard-stats">
                <div class="wcm-stat-card"><h3><?php esc_html_e( 'Awaiting Shipment', 'woo-comprehensive-monitor' ); ?></h3><p class="wcm-stat-number" style="color:#2271b1;"><?php echo esc_html( $stats['pre_ordered'] ); ?></p></div>
                <div class="wcm-stat-card"><h3><?php esc_html_e( 'Charged', 'woo-comprehensive-monitor' ); ?></h3><p class="wcm-stat-number" style="color:#4CAF50;"><?php echo esc_html( $stats['charged'] ); ?></p></div>
                <div class="wcm-stat-card"><h3><?php esc_html_e( 'Payment Failed', 'woo-comprehensive-monitor' ); ?></h3><p class="wcm-stat-number" style="color:#F44336;"><?php echo esc_html( $stats['failed'] ); ?></p></div>
            </div>

            <div class="wcm-info-box">
                <h3><?php esc_html_e( 'How Pre-Orders Work', 'woo-comprehensive-monitor' ); ?></h3>
                <p><?php esc_html_e( 'Products set to "Allow Backorders" automatically become pre-order products. At checkout, the customer\'s card is saved (not charged). When you change the order status to "Completed" (ship it), the card is charged automatically.', 'woo-comprehensive-monitor' ); ?></p>
                <ul style="list-style:disc;padding-left:20px;">
                    <li><?php esc_html_e( 'Product → Inventory → Allow Backorders = "Allow" or "Notify" → becomes a pre-order', 'woo-comprehensive-monitor' ); ?></li>
                    <li><?php esc_html_e( 'Set optional availability date, button text, and message in product editor', 'woo-comprehensive-monitor' ); ?></li>
                    <li><?php esc_html_e( 'Mixed carts (pre-order + in-stock) are blocked automatically', 'woo-comprehensive-monitor' ); ?></li>
                    <li><?php esc_html_e( 'Failed charges retry automatically after 24 hours', 'woo-comprehensive-monitor' ); ?></li>
                </ul>
            </div>

            <?php if ( ! empty( $orders ) ) : ?>
            <table class="wp-list-table widefat fixed striped">
                <thead>
                    <tr>
                        <th><?php esc_html_e( 'Order', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Customer', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Items', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Total', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Charge Status', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Date', 'woo-comprehensive-monitor' ); ?></th>
                        <th><?php esc_html_e( 'Actions', 'woo-comprehensive-monitor' ); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ( $orders as $order ) :
                        $charge_status = $order->get_meta( '_preorder_charge_status' );
                        $items = array();
                        foreach ( $order->get_items() as $item ) {
                            $items[] = $item->get_name() . ' × ' . $item->get_quantity();
                        }
                    ?>
                    <tr>
                        <td><a href="<?php echo esc_url( $order->get_edit_order_url() ); ?>">#<?php echo esc_html( $order->get_order_number() ); ?></a></td>
                        <td><?php echo esc_html( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() ); ?></td>
                        <td><?php echo esc_html( implode( ', ', $items ) ); ?></td>
                        <td><?php echo $order->get_formatted_order_total(); ?></td>
                        <td>
                            <?php
                            $cs_colors = array( 'pending' => '#FF9800', 'charged' => '#4CAF50', 'failed' => '#F44336', 'retry' => '#2196F3' );
                            $cs_color  = $cs_colors[ $charge_status ] ?? '#666';
                            printf( '<span style="color:%s;font-weight:bold;">%s</span>', esc_attr( $cs_color ), esc_html( ucfirst( $charge_status ?: $order->get_status() ) ) );
                            ?>
                        </td>
                        <td><?php echo esc_html( $order->get_date_created() ? $order->get_date_created()->date_i18n( get_option( 'date_format' ) ) : '' ); ?></td>
                        <td>
                            <?php if ( $order->has_status( 'pre-ordered' ) ) : ?>
                                <a href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-ajax.php?action=woocommerce_mark_order_status&status=completed&order_id=' . $order->get_id() ), 'woocommerce-mark-order-status' ) ); ?>" class="button button-small button-primary"><?php esc_html_e( 'Ship & Charge', 'woo-comprehensive-monitor' ); ?></a>
                            <?php endif; ?>
                            <a href="<?php echo esc_url( $order->get_edit_order_url() ); ?>" class="button button-small"><?php esc_html_e( 'View', 'woo-comprehensive-monitor' ); ?></a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            <?php else : ?>
            <p><?php esc_html_e( 'No pre-orders found. Set a product\'s backorder setting to "Allow" or "Notify" to enable pre-orders.', 'woo-comprehensive-monitor' ); ?></p>
            <?php endif; ?>
        </div>
        <?php
    }

    // ==========================================
    // AJAX HANDLERS
    // ==========================================
    public function ajax_run_health_check() {
        check_ajax_referer( 'wcm_admin_nonce', 'nonce' );
        if ( ! current_user_can( 'manage_woocommerce' ) ) { wp_die( 'Unauthorized' ); }
        $results = wcm()->get_health_monitor()->run_health_check();
        wp_send_json_success( array( 'message' => __( 'Health check completed.', 'woo-comprehensive-monitor' ), 'results' => $results ) );
    }

    public function ajax_clear_error_logs() {
        check_ajax_referer( 'wcm_admin_nonce', 'nonce' );
        if ( ! current_user_can( 'manage_woocommerce' ) ) { wp_die( 'Unauthorized' ); }
        global $wpdb;
        $wpdb->query( "TRUNCATE TABLE {$wpdb->prefix}wcm_error_logs" );
        wp_send_json_success( array( 'message' => __( 'Error logs cleared.', 'woo-comprehensive-monitor' ) ) );
    }

    public function ajax_check_disputes() {
        check_ajax_referer( 'wcm_admin_nonce', 'nonce' );
        if ( ! current_user_can( 'manage_woocommerce' ) ) { wp_die( 'Unauthorized' ); }
        wp_send_json_success( array( 'message' => __( 'Dispute check completed.', 'woo-comprehensive-monitor' ) ) );
    }

    public function ajax_generate_evidence() {
        check_ajax_referer( 'wcm_admin_nonce', 'nonce' );
        if ( ! current_user_can( 'manage_woocommerce' ) ) { wp_die( -1 ); }

        $dispute_id = isset( $_POST['dispute_id'] ) ? intval( $_POST['dispute_id'] ) : 0;
        if ( ! $dispute_id ) { wp_send_json_error( array( 'message' => 'Dispute ID required.' ) ); }

        global $wpdb;
        $dispute = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}wcm_dispute_evidence WHERE id = %d", $dispute_id ) );
        if ( ! $dispute ) { wp_send_json_error( array( 'message' => 'Dispute not found.' ) ); }

        if ( class_exists( 'WCM_Evidence_Generator' ) ) {
            $gen    = new WCM_Evidence_Generator();
            $result = $gen->generate_evidence( $dispute->order_id, $dispute->stripe_dispute_id, '', $dispute_id );
            if ( $result ) {
                wp_send_json_success( array( 'message' => 'Evidence generated.', 'file_url' => $result['file_url'] ) );
            }
        }
        wp_send_json_error( array( 'message' => 'Failed to generate evidence.' ) );
    }

    public function ajax_create_dispute() {
        check_ajax_referer( 'wcm_admin_nonce', 'nonce' );
        if ( ! current_user_can( 'manage_woocommerce' ) ) { wp_die( -1 ); }

        $order_id          = isset( $_POST['order_id'] ) ? intval( $_POST['order_id'] ) : 0;
        $stripe_dispute_id = isset( $_POST['stripe_dispute_id'] ) ? sanitize_text_field( wp_unslash( $_POST['stripe_dispute_id'] ) ) : '';
        if ( ! $order_id ) { wp_send_json_error( array( 'message' => 'Order ID required.' ) ); }

        if ( class_exists( 'WCM_Evidence_Generator' ) ) {
            $gen    = new WCM_Evidence_Generator();
            $result = $gen->generate_evidence( $order_id, $stripe_dispute_id );
            if ( $result ) {
                wp_send_json_success( array( 'message' => 'Evidence generated.', 'file_url' => $result['file_url'] ) );
            }
        }
        wp_send_json_error( array( 'message' => 'Failed to generate evidence.' ) );
    }

    public function ajax_update_dispute_status() {
        check_ajax_referer( 'wcm_admin_nonce', 'nonce' );
        if ( ! current_user_can( 'manage_woocommerce' ) ) { wp_die( -1 ); }

        $dispute_id = isset( $_POST['dispute_id'] ) ? intval( $_POST['dispute_id'] ) : 0;
        $status     = isset( $_POST['status'] ) ? sanitize_text_field( wp_unslash( $_POST['status'] ) ) : '';

        if ( ! $dispute_id || ! $status ) { wp_send_json_error( array( 'message' => 'Dispute ID and status required.' ) ); }
        if ( ! in_array( $status, array( 'pending', 'evidence_generated', 'submitted', 'won', 'lost', 'closed' ), true ) ) {
            wp_send_json_error( array( 'message' => 'Invalid status.' ) );
        }

        global $wpdb;
        $result = $wpdb->update( $wpdb->prefix . 'wcm_dispute_evidence', array( 'status' => $status ), array( 'id' => $dispute_id ) );
        if ( false !== $result ) {
            wp_send_json_success( array( 'message' => 'Status updated.' ) );
        }
        wp_send_json_error( array( 'message' => 'Failed to update status.' ) );
    }

    public function ajax_test_stripe() {
        check_ajax_referer( 'wcm_admin_nonce', 'nonce' );
        if ( ! current_user_can( 'manage_woocommerce' ) ) { wp_die( -1 ); }

        $api_key = get_option( 'wcm_stripe_api_key', '' );
        if ( empty( $api_key ) ) {
            // Try to get from WooCommerce Stripe settings
            $stripe_settings = get_option( 'woocommerce_stripe_settings' );
            if ( $stripe_settings ) {
                $api_key = 'yes' === ( $stripe_settings['testmode'] ?? '' )
                    ? ( $stripe_settings['test_secret_key'] ?? '' )
                    : ( $stripe_settings['secret_key'] ?? '' );
            }
        }

        if ( empty( $api_key ) ) {
            wp_send_json_error( array( 'message' => 'No Stripe API key configured.' ) );
        }

        $response = wp_remote_get( 'https://api.stripe.com/v1/balance', array(
            'headers' => array( 'Authorization' => 'Bearer ' . $api_key ),
            'timeout' => 15,
        ) );

        if ( is_wp_error( $response ) ) {
            wp_send_json_error( array( 'message' => 'Connection failed: ' . $response->get_error_message() ) );
        }

        if ( 200 === wp_remote_retrieve_response_code( $response ) ) {
            wp_send_json_success( array( 'message' => 'Stripe connection successful!' ) );
        }

        $body = json_decode( wp_remote_retrieve_body( $response ), true );
        wp_send_json_error( array( 'message' => 'Stripe error: ' . ( $body['error']['message'] ?? 'Unknown' ) ) );
    }
}
