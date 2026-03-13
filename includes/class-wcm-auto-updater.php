<?php
/**
 * Safe Auto-updater for WooCommerce Comprehensive Monitor from GitHub releases
 * Includes backup, rollback, and compatibility checks
 *
 * @package WooComprehensiveMonitor
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WCM_Auto_Updater {

    /**
     * GitHub repository owner
     */
    const REPO_OWNER = 'camster91';

    /**
     * GitHub repository name
     */
    const REPO_NAME = 'woo-comprehensive-monitor';

    /**
     * GitHub API URL
     */
    const GITHUB_API_URL = 'https://api.github.com/repos/' . self::REPO_OWNER . '/' . self::REPO_NAME . '/releases/latest';

    /**
     * Plugin slug
     */
    private $plugin_slug;

    /**
     * Plugin basename
     */
    private $plugin_basename;

    /**
     * Backup directory
     */
    private $backup_dir;

    /**
     * Constructor
     */
    public function __construct() {
        $this->plugin_slug = 'woo-comprehensive-monitor';
        $this->plugin_basename = 'woo-comprehensive-monitor/woo-comprehensive-monitor.php';
        $this->backup_dir = WP_CONTENT_DIR . '/wcm-backups/';

        // Hook into WordPress update system
        add_filter( 'pre_set_site_transient_update_plugins', array( $this, 'check_for_updates' ) );
        add_filter( 'plugins_api', array( $this, 'plugins_api_filter' ), 10, 3 );
        add_filter( 'upgrader_pre_install', array( $this, 'pre_install' ), 10, 2 );
        add_filter( 'upgrader_post_install', array( $this, 'post_install' ), 10, 3 );
        add_action( 'upgrader_process_complete', array( $this, 'process_complete' ), 10, 2 );

        // Add update check cron
        add_action( 'wcm_check_for_updates', array( $this, 'force_update_check' ) );
        // NOTE: cron scheduling is handled in the main plugin file at activation/upgrade.
        // wp_next_scheduled() reads from the autoloaded cron option on every page load.

        // Add auto-update setting filter
        add_filter( 'auto_update_plugin', array( $this, 'maybe_auto_update' ), 10, 2 );

        // Add admin notice for major updates
        add_action( 'admin_notices', array( $this, 'maybe_show_update_notice' ) );

        // AJAX handlers for update actions
        add_action( 'wp_ajax_wcm_backup_plugin', array( $this, 'ajax_backup_plugin' ) );
        add_action( 'wp_ajax_wcm_rollback_plugin', array( $this, 'ajax_rollback_plugin' ) );
        add_action( 'wp_ajax_wcm_check_compatibility', array( $this, 'ajax_check_compatibility' ) );
    }

    /**
     * Check for updates from GitHub
     */
    public function check_for_updates( $transient ) {
        // If we've already checked, return cached result
        if ( empty( $transient->checked ) ) {
            return $transient;
        }

        // Get latest release from GitHub
        $latest_release = $this->get_latest_release();
        if ( ! $latest_release ) {
            return $transient;
        }

        // Compare versions
        $current_version = WCM_VERSION;
        $latest_version = ltrim( $latest_release['tag_name'], 'v' );

        if ( version_compare( $latest_version, $current_version, '>' ) ) {
            // Check if this is a major update (x.x.0 -> x+1.0.0 or x.x.x -> x.x+1.0)
            $is_major_update = $this->is_major_update( $current_version, $latest_version );
            
            // Get update settings
            $update_settings = $this->get_update_settings();
            
            // For major updates with manual confirmation required, don't auto-update
            if ( $is_major_update && $update_settings['major_updates'] === 'confirm' ) {
                // Store update info for manual confirmation
                $this->store_pending_update( $latest_release );
                // Still show update available in WordPress updates
            }

            // New version available
            $plugin_data = get_plugin_data( WCM_PLUGIN_DIR . 'woo-comprehensive-monitor.php' );

            $update = new stdClass();
            $update->slug = $this->plugin_slug;
            $update->plugin = $this->plugin_basename;
            $update->new_version = $latest_version;
            $update->url = $plugin_data['PluginURI'];
            $update->package = $latest_release['zipball_url'];
            $update->tested = $latest_release['target_commitish'] ?? 'master';
            $update->requires_php = '7.4';
            $update->requires = '5.6';
            $update->last_updated = $latest_release['published_at'];
            $update->sections = array(
                'description' => $plugin_data['Description'],
                'changelog' => $this->parse_changelog( $latest_release['body'] ),
                'compatibility' => $this->check_compatibility( $latest_release ),
            );

            // Add update metadata for our safety checks
            $update->wcm_update_data = array(
                'is_major' => $is_major_update,
                'requires_backup' => $update_settings['create_backup'],
                'requires_compat_check' => $update_settings['check_compatibility'],
            );

            $transient->response[ $this->plugin_basename ] = $update;
        }

        return $transient;
    }

    /**
     * Get latest release from GitHub API
     */
    private function get_latest_release() {
        $transient_key = 'wcm_latest_release';
        $cached = get_transient( $transient_key );

        if ( $cached !== false ) {
            return $cached;
        }

        $response = wp_remote_get( self::GITHUB_API_URL, array(
            'headers' => array(
                'Accept' => 'application/vnd.github.v3+json',
                'User-Agent' => 'WooCommerce-Comprehensive-Monitor/' . WCM_VERSION,
            ),
            'timeout' => 15,
        ) );

        if ( is_wp_error( $response ) || wp_remote_retrieve_response_code( $response ) !== 200 ) {
            // Fallback: try again in 1 hour
            set_transient( $transient_key, false, HOUR_IN_SECONDS );
            error_log( '[WCM Auto-Updater] Failed to fetch GitHub release: ' . wp_remote_retrieve_response_message( $response ) );
            return false;
        }

        $body = wp_remote_retrieve_body( $response );
        $release = json_decode( $body, true );

        if ( ! isset( $release['tag_name'] ) ) {
            set_transient( $transient_key, false, HOUR_IN_SECONDS );
            error_log( '[WCM Auto-Updater] Invalid GitHub release response' );
            return false;
        }

        // Cache for 6 hours
        set_transient( $transient_key, $release, 6 * HOUR_IN_SECONDS );

        return $release;
    }

    /**
     * Parse changelog from release body
     */
    private function parse_changelog( $body ) {
        if ( empty( $body ) ) {
            return '<p>No changelog provided for this release.</p>';
        }

        // Convert markdown to basic HTML
        $body = esc_html( $body );
        $body = preg_replace( '/\*\*(.*?)\*\*/', '<strong>$1</strong>', $body );
        $body = preg_replace( '/\*(.*?)\*/', '<em>$1</em>', $body );
        $body = preg_replace( '/`(.*?)`/', '<code>$1</code>', $body );
        $body = nl2br( $body );

        return '<div class="wcm-changelog">' . $body . '</div>';
    }

    /**
     * Check compatibility with current environment
     */
    private function check_compatibility( $release ) {
        global $wp_version;
        
        $compatibility = array(
            'php' => true,
            'wp' => true,
            'woocommerce' => true,
            'issues' => array(),
        );

        // Check PHP version
        $requires_php = '7.4';
        if ( isset( $release['requires_php'] ) ) {
            $requires_php = $release['requires_php'];
        }
        
        if ( version_compare( PHP_VERSION, $requires_php, '<' ) ) {
            $compatibility['php'] = false;
            $compatibility['issues'][] = sprintf(
                'PHP %s required (you have %s)',
                $requires_php,
                PHP_VERSION
            );
        }

        // Check WordPress version
        $requires_wp = '5.6';
        if ( isset( $release['requires'] ) ) {
            $requires_wp = $release['requires'];
        }
        
        if ( version_compare( $wp_version, $requires_wp, '<' ) ) {
            $compatibility['wp'] = false;
            $compatibility['issues'][] = sprintf(
                'WordPress %s required (you have %s)',
                $requires_wp,
                $wp_version
            );
        }

        // Check WooCommerce version if active
        if ( class_exists( 'WooCommerce' ) ) {
            $wc_version = defined( 'WC_VERSION' ) ? WC_VERSION : '0';
            $requires_wc = '5.0';
            
            if ( version_compare( $wc_version, $requires_wc, '<' ) ) {
                $compatibility['woocommerce'] = false;
                $compatibility['issues'][] = sprintf(
                    'WooCommerce %s required (you have %s)',
                    $requires_wc,
                    $wc_version
                );
            }
        }

        if ( empty( $compatibility['issues'] ) ) {
            return '<p>✅ Compatible with your current environment.</p>';
        }

        $html = '<div class="wcm-compatibility-issues">';
        $html .= '<p><strong>⚠️ Compatibility Issues:</strong></p>';
        $html .= '<ul>';
        foreach ( $compatibility['issues'] as $issue ) {
            $html .= '<li>' . esc_html( $issue ) . '</li>';
        }
        $html .= '</ul>';
        $html .= '</div>';

        return $html;
    }

    /**
     * Filter for plugins_api to provide plugin information
     */
    public function plugins_api_filter( $result, $action, $args ) {
        if ( $action !== 'plugin_information' ) {
            return $result;
        }

        if ( ! isset( $args->slug ) || $args->slug !== $this->plugin_slug ) {
            return $result;
        }

        $latest_release = $this->get_latest_release();
        if ( ! $latest_release ) {
            return $result;
        }

        $plugin_data = get_plugin_data( WCM_PLUGIN_DIR . 'woo-comprehensive-monitor.php' );
        $latest_version = ltrim( $latest_release['tag_name'], 'v' );

        $info = new stdClass();
        $info->name = $plugin_data['Name'];
        $info->slug = $this->plugin_slug;
        $info->version = $latest_version;
        $info->author = $plugin_data['Author'];
        $info->author_profile = $plugin_data['AuthorURI'];
        $info->requires = '5.6';
        $info->tested = '6.5';
        $info->requires_php = '7.4';
        $info->last_updated = $latest_release['published_at'];
        $info->download_link = $latest_release['zipball_url'];
        $info->sections = array(
            'description' => $plugin_data['Description'],
            'installation' => '<p>Automatic updates are enabled. The plugin will update itself when new versions are released on GitHub.</p>',
            'changelog' => $this->parse_changelog( $latest_release['body'] ),
            'compatibility' => $this->check_compatibility( $latest_release ),
        );

        return $info;
    }

    /**
     * Pre-installation: create backup if enabled
     */
    public function pre_install( $response, $plugin ) {
        // Only backup our plugin
        if ( $plugin['plugin'] !== $this->plugin_basename ) {
            return $response;
        }

        $settings = $this->get_update_settings();
        
        if ( $settings['create_backup'] ) {
            $backup_created = $this->create_backup();
            
            if ( ! $backup_created ) {
                // Log error but don't stop update
                error_log( '[WCM Auto-Updater] Failed to create backup before update' );
            }
        }

        return $response;
    }

    /**
     * Post-installation handling
     */
    public function post_install( $response, $hook_extra, $result ) {
        global $wp_filesystem;

        // Only process our plugin
        if ( ! isset( $hook_extra['plugin'] ) || $hook_extra['plugin'] !== $this->plugin_basename ) {
            return $response;
        }

        $install_directory = plugin_dir_path( WCM_PLUGIN_DIR . 'woo-comprehensive-monitor.php' );
        $wp_filesystem->move( $result['destination'], $install_directory );
        $result['destination'] = $install_directory;

        // Re-activate plugin
        activate_plugin( $this->plugin_basename );

        // Log successful update
        $this->log_update( 'success', 'Plugin updated successfully' );

        return $result;
    }

    /**
     * Process complete - cleanup
     */
    public function process_complete( $upgrader, $hook_extra ) {
        // Only process our plugin updates
        if ( ! isset( $hook_extra['plugin'] ) || $hook_extra['plugin'] !== $this->plugin_basename ) {
            return;
        }

        // Clear update cache
        delete_transient( 'wcm_latest_release' );
        
        // Clear pending update if any
        delete_option( 'wcm_pending_update' );
    }

    /**
     * Create backup of current plugin
     */
    private function create_backup() {
        $plugin_dir = WCM_PLUGIN_DIR;
        $backup_file = $this->backup_dir . 'wcm-backup-' . date( 'Y-m-d-H-i-s' ) . '-' . WCM_VERSION . '.zip';

        // Ensure backup directory exists
        if ( ! is_dir( $this->backup_dir ) ) {
            wp_mkdir_p( $this->backup_dir );
        }

        // Create ZIP backup
        if ( class_exists( 'ZipArchive' ) ) {
            $zip = new ZipArchive();
            
            if ( $zip->open( $backup_file, ZipArchive::CREATE | ZipArchive::OVERWRITE ) === TRUE ) {
                // Add all plugin files
                $files = new RecursiveIteratorIterator(
                    new RecursiveDirectoryIterator( $plugin_dir ),
                    RecursiveIteratorIterator::LEAVES_ONLY
                );

                foreach ( $files as $file ) {
                    if ( ! $file->isDir() ) {
                        $file_path = $file->getRealPath();
                        $relative_path = substr( $file_path, strlen( $plugin_dir ) );
                        
                        // Skip backup directory and certain files
                        if ( strpos( $relative_path, 'wcm-backups' ) === 0 ) {
                            continue;
                        }
                        
                        $zip->addFile( $file_path, $relative_path );
                    }
                }
                
                $zip->close();
                
                // Store backup info
                $backups = get_option( 'wcm_backups', array() );
                $backups[] = array(
                    'file' => basename( $backup_file ),
                    'version' => WCM_VERSION,
                    'date' => current_time( 'mysql' ),
                    'size' => filesize( $backup_file ),
                );
                
                // Keep only last 5 backups
                if ( count( $backups ) > 5 ) {
                    $old_backup = array_shift( $backups );
                    $old_file = $this->backup_dir . $old_backup['file'];
                    if ( file_exists( $old_file ) ) {
                        unlink( $old_file );
                    }
                }
                
                update_option( 'wcm_backups', $backups );
                
                $this->log_update( 'backup', 'Created backup: ' . basename( $backup_file ) );
                return true;
            }
        }

        return false;
    }

    /**
     * Restore from backup
     */
    public function restore_backup( $backup_file ) {
        $backup_path = $this->backup_dir . $backup_file;
        
        if ( ! file_exists( $backup_path ) ) {
            return false;
        }

        $plugin_dir = WCM_PLUGIN_DIR;
        
        // Deactivate plugin first
        deactivate_plugins( $this->plugin_basename );
        
        // Clear plugin directory
        $this->delete_directory( $plugin_dir );
        
        // Extract backup
        if ( class_exists( 'ZipArchive' ) ) {
            $zip = new ZipArchive();
            
            if ( $zip->open( $backup_path ) === TRUE ) {
                $zip->extractTo( $plugin_dir );
                $zip->close();
                
                // Re-activate plugin
                activate_plugin( $this->plugin_basename );
                
                $this->log_update( 'restore', 'Restored from backup: ' . $backup_file );
                return true;
            }
        }
        
        return false;
    }

    /**
     * Delete directory recursively
     */
    private function delete_directory( $dir ) {
        if ( ! is_dir( $dir ) ) {
            return;
        }
        
        $files = array_diff( scandir( $dir ), array( '.', '..' ) );
        
        foreach ( $files as $file ) {
            $path = $dir . '/' . $file;
            
            if ( is_dir( $path ) ) {
                $this->delete_directory( $path );
            } else {
                unlink( $path );
            }
        }
        
        rmdir( $dir );
    }

    /**
     * Check if update is major
     */
    private function is_major_update( $current, $latest ) {
        $current_parts = explode( '.', $current );
        $latest_parts = explode( '.', $latest );
        
        // Major version change (x.0.0 -> x+1.0.0)
        if ( $latest_parts[0] > $current_parts[0] ) {
            return true;
        }
        
        // Minor version change (x.x.0 -> x.x+1.0) when current minor is 0
        if ( $latest_parts[1] > $current_parts[1] && $current_parts[2] == 0 ) {
            return true;
        }
        
        return false;
    }

    /**
     * Store pending update for manual confirmation
     */
    private function store_pending_update( $release ) {
        update_option( 'wcm_pending_update', array(
            'version' => ltrim( $release['tag_name'], 'v' ),
            'changelog' => $release['body'],
            'published' => $release['published_at'],
            'url' => $release['html_url'],
        ) );
    }

    /**
     * Show admin notice for pending major update
     */
    public function maybe_show_update_notice() {
        $pending_update = get_option( 'wcm_pending_update' );
        
        if ( ! $pending_update ) {
            return;
        }

        $settings_url = admin_url( 'admin.php?page=woo-comprehensive-monitor-settings&tab=advanced' );
        
        ?>
        <div class="notice notice-warning">
            <p>
                <strong>WooCommerce Comprehensive Monitor Update Available</strong><br>
                Version <?php echo esc_html( $pending_update['version'] ); ?> is available.
                This appears to be a major update. Please review the 
                <a href="<?php echo esc_url( $pending_update['url'] ); ?>" target="_blank">changelog</a>
                and update from the <a href="<?php echo esc_url( $settings_url ); ?>">plugin settings</a>.
            </p>
        </div>
        <?php
    }

    /**
     * Get update settings
     */
    private function get_update_settings() {
        return array(
            'enabled' => get_option( 'wcm_auto_updates', 'yes' ) === 'yes',
            'create_backup' => get_option( 'wcm_update_backup', 'yes' ) === 'yes',
            'check_compatibility' => get_option( 'wcm_update_compatibility', 'yes' ) === 'yes',
            'major_updates' => get_option( 'wcm_major_updates', 'auto' ), // auto, confirm, manual
        );
    }

    /**
     * Force update check
     */
    public function force_update_check() {
        delete_transient( 'wcm_latest_release' );
        wp_update_plugins();
    }

    /**
     * Enable auto-updates based on setting
     */
    public function maybe_auto_update( $update, $item ) {
        // Only affect our plugin
        if ( $item->plugin !== $this->plugin_basename ) {
            return $update;
        }

        $settings = $this->get_update_settings();
        
        if ( ! $settings['enabled'] ) {
            return false;
        }

        // Check for major update settings
        $latest_release = $this->get_latest_release();
        if ( $latest_release ) {
            $current_version = WCM_VERSION;
            $latest_version = ltrim( $latest_release['tag_name'], 'v' );
            
            if ( version_compare( $latest_version, $current_version, '>' ) ) {
                if ( $this->is_major_update( $current_version, $latest_version ) ) {
                    if ( $settings['major_updates'] === 'manual' ) {
                        return false; // Don't auto-update major versions
                    }
                    
                    if ( $settings['major_updates'] === 'confirm' ) {
                        // Store for manual confirmation, don't auto-update
                        $this->store_pending_update( $latest_release );
                        return false;
                    }
                }
            }
        }

        return true;
    }

    /**
     * Log update events
     */
    private function log_update( $type, $message ) {
        $logs = get_option( 'wcm_update_logs', array() );
        
        $logs[] = array(
            'type' => $type,
            'message' => $message,
            'timestamp' => current_time( 'mysql' ),
            'version' => WCM_VERSION,
        );
        
        // Keep only last 50 logs
        if ( count( $logs ) > 50 ) {
            array_shift( $logs );
        }
        
        update_option( 'wcm_update_logs', $logs );
        
        // Also log to error log for debugging
        if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
            error_log( '[WCM Auto-Updater] ' . $message );
        }
    }

    /**
     * Get update status for dashboard
     */
    public static function get_update_status() {
        $instance = new self();
        $latest_release = $instance->get_latest_release();
        
        if ( ! $latest_release ) {
            return array(
                'available' => false,
                'current_version' => WCM_VERSION,
                'latest_version' => WCM_VERSION,
                'error' => 'Could not fetch release information',
            );
        }

        $current_version = WCM_VERSION;
        $latest_version = ltrim( $latest_release['tag_name'], 'v' );
        $update_available = version_compare( $latest_version, $current_version, '>' );

        return array(
            'available' => $update_available,
            'current_version' => $current_version,
            'latest_version' => $latest_version,
            'release_url' => $latest_release['html_url'],
            'published_at' => $latest_release['published_at'],
            'changelog' => $latest_release['body'],
            'is_major' => $instance->is_major_update( $current_version, $latest_version ),
        );
    }

    /**
     * AJAX: Create backup
     */
    public function ajax_backup_plugin() {
        check_ajax_referer( 'wcm_ajax_nonce', 'nonce' );
        
        if ( ! current_user_can( 'update_plugins' ) ) {
            wp_die( 'Unauthorized' );
        }
        
        $result = $this->create_backup();
        
        if ( $result ) {
            wp_send_json_success( array( 'message' => 'Backup created successfully' ) );
        } else {
            wp_send_json_error( array( 'message' => 'Failed to create backup' ) );
        }
    }

    /**
     * AJAX: Rollback to backup
     */
    public function ajax_rollback_plugin() {
        check_ajax_referer( 'wcm_ajax_nonce', 'nonce' );
        
        if ( ! current_user_can( 'update_plugins' ) ) {
            wp_die( 'Unauthorized' );
        }
        
        $backup_file = isset( $_POST['backup_file'] ) ? sanitize_text_field( $_POST['backup_file'] ) : '';
        
        if ( empty( $backup_file ) ) {
            wp_send_json_error( array( 'message' => 'No backup file specified' ) );
        }
        
        $result = $this->restore_backup( $backup_file );
        
        if ( $result ) {
            wp_send_json_success( array( 'message' => 'Plugin restored from backup' ) );
        } else {
            wp_send_json_error( array( 'message' => 'Failed to restore from backup' ) );
        }
    }

    /**
     * AJAX: Check compatibility
     */
    public function ajax_check_compatibility() {
        check_ajax_referer( 'wcm_ajax_nonce', 'nonce' );
        
        if ( ! current_user_can( 'update_plugins' ) ) {
            wp_die( 'Unauthorized' );
        }
        
        $latest_release = $this->get_latest_release();
        
        if ( ! $latest_release ) {
            wp_send_json_error( array( 'message' => 'Could not fetch release information' ) );
        }
        
        $compatibility = $this->check_compatibility( $latest_release );
        
        wp_send_json_success( array(
            'compatible' => strpos( $compatibility, '✅' ) !== false,
            'html' => $compatibility,
        ) );
    }
}