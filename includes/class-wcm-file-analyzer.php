<?php
/**
 * File Analyzer — provides secure file access for AI analysis
 * Enables the monitoring dashboard AI to analyze WordPress files for troubleshooting
 *
 * @package WooComprehensiveMonitor
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WCM_File_Analyzer {

    private static $instance = null;

    public static function get_instance() {
        if ( null === self::$instance ) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        // Register REST API endpoints
        add_action( 'rest_api_init', array( $this, 'register_rest_endpoints' ) );
        
        // Register AJAX endpoints for admin
        add_action( 'wp_ajax_wcm_analyze_file', array( $this, 'ajax_analyze_file' ) );
        add_action( 'wp_ajax_wcm_list_files', array( $this, 'ajax_list_files' ) );
        add_action( 'wp_ajax_wcm_search_files', array( $this, 'ajax_search_files' ) );
    }

    /**
     * Register REST API endpoints for file analysis
     */
    public function register_rest_endpoints() {
        // Register endpoint for file listing (requires authentication)
        register_rest_route( 'wcm/v1', '/files/list', array(
            'methods'  => 'GET',
            'callback' => array( $this, 'rest_list_files' ),
            'permission_callback' => array( $this, 'check_api_permissions' ),
        ) );

        // Register endpoint for file content (requires authentication)
        register_rest_route( 'wcm/v1', '/files/content', array(
            'methods'  => 'GET',
            'callback' => array( $this, 'rest_get_file_content' ),
            'permission_callback' => array( $this, 'check_api_permissions' ),
        ) );

        // Register endpoint for file search (requires authentication)
        register_rest_route( 'wcm/v1', '/files/search', array(
            'methods'  => 'GET',
            'callback' => array( $this, 'rest_search_files' ),
            'permission_callback' => array( $this, 'check_api_permissions' ),
        ) );

        // Register endpoint for system info (requires authentication)
        register_rest_route( 'wcm/v1', '/system/info', array(
            'methods'  => 'GET',
            'callback' => array( $this, 'rest_get_system_info' ),
            'permission_callback' => array( $this, 'check_api_permissions' ),
        ) );
    }

    /**
     * Check if the request is authorized
     * Uses WooCommerce REST API authentication or custom API key
     */
    public function check_api_permissions( $request ) {
        // First check if user is authenticated via WordPress (for admin AJAX)
        if ( current_user_can( 'manage_options' ) ) {
            return true;
        }

        // Check for WooCommerce REST API authentication
        if ( $this->is_woocommerce_api_authenticated() ) {
            return true;
        }

        // Check for custom API key in header or query parameter
        $api_key = $request->get_header( 'X-WCM-API-Key' ) ?: $request->get_param( 'api_key' );
        $valid_api_key = get_option( 'wcm_file_access_api_key' );
        
        if ( $valid_api_key && hash_equals( $valid_api_key, $api_key ) ) {
            return true;
        }

        // Check for monitoring server authentication (store ID match)
        $store_id = $request->get_param( 'store_id' );
        $expected_store_id = get_option( 'wcm_store_id' );
        
        if ( $store_id && $expected_store_id && $store_id === $expected_store_id ) {
            return true;
        }

        return new WP_Error( 'rest_forbidden', __( 'Access denied. Invalid authentication.', 'woo-comprehensive-monitor' ), array( 'status' => 403 ) );
    }

    /**
     * Check if request is authenticated via WooCommerce REST API
     */
    private function is_woocommerce_api_authenticated() {
        // WooCommerce REST API authentication is handled by WordPress core
        // If we get to this point and the user is not authenticated via standard methods,
        // we'll rely on the permission_callback checks
        return false;
    }

    /**
     * REST endpoint: List files in a directory
     */
    public function rest_list_files( $request ) {
        $path = $request->get_param( 'path' );
        $allowed_paths = $this->get_allowed_paths();
        
        // Validate path is within allowed directories
        $safe_path = $this->validate_path( $path );
        if ( is_wp_error( $safe_path ) ) {
            return $safe_path;
        }

        try {
            $files = $this->list_directory( $safe_path );
            return rest_ensure_response( array(
                'success' => true,
                'path' => $safe_path,
                'files' => $files,
            ) );
        } catch ( Exception $e ) {
            return new WP_Error( 'list_failed', $e->getMessage(), array( 'status' => 500 ) );
        }
    }

    /**
     * REST endpoint: Get file content
     */
    public function rest_get_file_content( $request ) {
        $path = $request->get_param( 'path' );
        $max_lines = (int) $request->get_param( 'max_lines' ) ?: 100;
        
        // Validate path is within allowed directories
        $safe_path = $this->validate_path( $path );
        if ( is_wp_error( $safe_path ) ) {
            return $safe_path;
        }

        // Check file size limit (2MB)
        if ( filesize( $safe_path ) > 2 * 1024 * 1024 ) {
            return new WP_Error( 'file_too_large', __( 'File exceeds size limit of 2MB.', 'woo-comprehensive-monitor' ), array( 'status' => 400 ) );
        }

        try {
            $content = $this->read_file_safely( $safe_path, $max_lines );
            return rest_ensure_response( array(
                'success' => true,
                'path' => $safe_path,
                'size' => filesize( $safe_path ),
                'modified' => filemtime( $safe_path ),
                'content' => $content,
            ) );
        } catch ( Exception $e ) {
            return new WP_Error( 'read_failed', $e->getMessage(), array( 'status' => 500 ) );
        }
    }

    /**
     * REST endpoint: Search files for content
     */
    public function rest_search_files( $request ) {
        $query = $request->get_param( 'query' );
        $path = $request->get_param( 'path' );
        $extension = $request->get_param( 'extension' );
        
        // Validate path is within allowed directories
        $safe_path = $this->validate_path( $path );
        if ( is_wp_error( $safe_path ) ) {
            return $safe_path;
        }

        // Limit search to prevent DoS
        if ( strlen( $query ) < 3 ) {
            return new WP_Error( 'query_too_short', __( 'Search query must be at least 3 characters.', 'woo-comprehensive-monitor' ), array( 'status' => 400 ) );
        }

        try {
            $results = $this->search_files( $safe_path, $query, $extension );
            return rest_ensure_response( array(
                'success' => true,
                'query' => $query,
                'path' => $safe_path,
                'results' => $results,
            ) );
        } catch ( Exception $e ) {
            return new WP_Error( 'search_failed', $e->getMessage(), array( 'status' => 500 ) );
        }
    }

    /**
     * REST endpoint: Get system information
     */
    public function rest_get_system_info( $request ) {
        global $wpdb;
        
        $info = array(
            'wordpress' => array(
                'version' => get_bloginfo( 'version' ),
                'multisite' => is_multisite(),
                'language' => get_bloginfo( 'language' ),
            ),
            'php' => array(
                'version' => phpversion(),
                'memory_limit' => ini_get( 'memory_limit' ),
                'max_execution_time' => ini_get( 'max_execution_time' ),
                'upload_max_filesize' => ini_get( 'upload_max_filesize' ),
            ),
            'database' => array(
                'version' => $wpdb->db_version(),
                'charset' => $wpdb->charset,
                'table_prefix' => $wpdb->prefix,
            ),
            'woocommerce' => array(
                'version' => defined( 'WC_VERSION' ) ? WC_VERSION : 'Not active',
                'currency' => get_woocommerce_currency(),
                'country' => get_option( 'woocommerce_default_country' ),
            ),
            'plugins' => $this->get_active_plugins_info(),
            'theme' => $this->get_current_theme_info(),
            'server' => array(
                'software' => $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown',
                'protocol' => $_SERVER['SERVER_PROTOCOL'] ?? 'Unknown',
                'https' => ! empty( $_SERVER['HTTPS'] ) && $_SERVER['HTTPS'] !== 'off',
            ),
        );

        return rest_ensure_response( array(
            'success' => true,
            'info' => $info,
        ) );
    }

    /**
     * AJAX endpoint: Analyze a file (admin only)
     */
    public function ajax_analyze_file() {
        // Check nonce and permissions
        check_ajax_referer( 'wcm_file_analysis', 'nonce' );
        
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( -1, 403 );
        }

        $path = sanitize_text_field( $_POST['path'] ?? '' );
        $safe_path = $this->validate_path( $path );
        
        if ( is_wp_error( $safe_path ) ) {
            wp_send_json_error( array( 'message' => $safe_path->get_error_message() ) );
        }

        try {
            $analysis = $this->analyze_file( $safe_path );
            wp_send_json_success( $analysis );
        } catch ( Exception $e ) {
            wp_send_json_error( array( 'message' => $e->getMessage() ) );
        }
    }

    /**
     * AJAX endpoint: List files (admin only)
     */
    public function ajax_list_files() {
        // Check nonce and permissions
        check_ajax_referer( 'wcm_file_analysis', 'nonce' );
        
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( -1, 403 );
        }

        $path = sanitize_text_field( $_POST['path'] ?? ABSPATH );
        $safe_path = $this->validate_path( $path );
        
        if ( is_wp_error( $safe_path ) ) {
            wp_send_json_error( array( 'message' => $safe_path->get_error_message() ) );
        }

        try {
            $files = $this->list_directory( $safe_path );
            wp_send_json_success( array( 'path' => $safe_path, 'files' => $files ) );
        } catch ( Exception $e ) {
            wp_send_json_error( array( 'message' => $e->getMessage() ) );
        }
    }

    /**
     * AJAX endpoint: Search files (admin only)
     */
    public function ajax_search_files() {
        // Check nonce and permissions
        check_ajax_referer( 'wcm_file_analysis', 'nonce' );
        
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( -1, 403 );
        }

        $query = sanitize_text_field( $_POST['query'] ?? '' );
        $path = sanitize_text_field( $_POST['path'] ?? ABSPATH );
        $extension = sanitize_text_field( $_POST['extension'] ?? '' );
        
        if ( strlen( $query ) < 3 ) {
            wp_send_json_error( array( 'message' => 'Search query must be at least 3 characters.' ) );
        }

        $safe_path = $this->validate_path( $path );
        
        if ( is_wp_error( $safe_path ) ) {
            wp_send_json_error( array( 'message' => $safe_path->get_error_message() ) );
        }

        try {
            $results = $this->search_files( $safe_path, $query, $extension );
            wp_send_json_success( array( 'query' => $query, 'results' => $results ) );
        } catch ( Exception $e ) {
            wp_send_json_error( array( 'message' => $e->getMessage() ) );
        }
    }

    /**
     * ==========================================
     * HELPER METHODS
     * ==========================================
     */

    /**
     * Get allowed paths for file access
     */
    private function get_allowed_paths() {
        return array(
            ABSPATH,
            WP_CONTENT_DIR,
            WP_PLUGIN_DIR,
            get_template_directory(),
            get_stylesheet_directory(),
            // Allow plugin's own directory
            dirname( dirname( __FILE__ ) ),
        );
    }

    /**
     * Validate that a path is within allowed directories
     */
    private function validate_path( $path ) {
        if ( empty( $path ) ) {
            $path = ABSPATH;
        }

        // Convert to absolute path
        $real_path = realpath( $path );
        if ( ! $real_path ) {
            return new WP_Error( 'invalid_path', __( 'Path does not exist or is not accessible.', 'woo-comprehensive-monitor' ) );
        }

        // Check if path is within allowed directories
        $allowed = false;
        foreach ( $this->get_allowed_paths() as $allowed_path ) {
            $allowed_real = realpath( $allowed_path );
            if ( $allowed_real && strpos( $real_path, $allowed_real ) === 0 ) {
                $allowed = true;
                break;
            }
        }

        if ( ! $allowed ) {
            return new WP_Error( 'path_not_allowed', __( 'Access to this path is not allowed.', 'woo-comprehensive-monitor' ) );
        }

        return $real_path;
    }

    /**
     * List directory contents
     */
    private function list_directory( $path ) {
        if ( ! is_dir( $path ) ) {
            throw new Exception( 'Path is not a directory.' );
        }

        $files = array();
        $items = scandir( $path );
        
        foreach ( $items as $item ) {
            if ( $item === '.' || $item === '..' ) {
                continue;
            }

            $full_path = $path . DIRECTORY_SEPARATOR . $item;
            $files[] = array(
                'name' => $item,
                'path' => $full_path,
                'type' => is_dir( $full_path ) ? 'directory' : 'file',
                'size' => is_file( $full_path ) ? filesize( $full_path ) : 0,
                'modified' => filemtime( $full_path ),
                'readable' => is_readable( $full_path ),
                'writable' => is_writable( $full_path ),
            );
        }

        // Sort: directories first, then by name
        usort( $files, function( $a, $b ) {
            if ( $a['type'] === $b['type'] ) {
                return strcasecmp( $a['name'], $b['name'] );
            }
            return $a['type'] === 'directory' ? -1 : 1;
        } );

        return $files;
    }

    /**
     * Read file safely with line limit
     */
    private function read_file_safely( $path, $max_lines = 100 ) {
        if ( ! is_file( $path ) || ! is_readable( $path ) ) {
            throw new Exception( 'File is not readable.' );
        }

        // Check if it's a text file by extension
        $extension = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
        $text_extensions = array( 'php', 'js', 'css', 'txt', 'html', 'htm', 'xml', 'json', 'md', 'yml', 'yaml', 'ini', 'sql' );
        
        if ( ! in_array( $extension, $text_extensions ) ) {
            return '// Binary file or unsupported format.';
        }

        $content = file_get_contents( $path );
        if ( $content === false ) {
            throw new Exception( 'Failed to read file.' );
        }

        // Limit to max lines
        $lines = explode( "\n", $content );
        if ( count( $lines ) > $max_lines ) {
            $lines = array_slice( $lines, 0, $max_lines );
            $lines[] = "\n// ... File truncated. " . ( count( $lines ) - $max_lines ) . ' more lines not shown.';
        }

        return implode( "\n", $lines );
    }

    /**
     * Search files for content (simple grep)
     */
    private function search_files( $path, $query, $extension = '' ) {
        if ( ! is_dir( $path ) ) {
            throw new Exception( 'Path is not a directory.' );
        }

        $results = array();
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator( $path, RecursiveDirectoryIterator::SKIP_DOTS ),
            RecursiveIteratorIterator::SELF_FIRST
        );

        $count = 0;
        $max_files = 100; // Limit for performance

        foreach ( $iterator as $file ) {
            if ( $count >= $max_files ) {
                break;
            }

            if ( ! $file->isFile() || ! $file->isReadable() ) {
                continue;
            }

            // Filter by extension if specified
            if ( $extension && $file->getExtension() !== $extension ) {
                continue;
            }

            // Check file size (skip large files)
            if ( $file->getSize() > 1024 * 1024 ) { // 1MB
                continue;
            }

            try {
                $content = file_get_contents( $file->getPathname() );
                if ( $content !== false && stripos( $content, $query ) !== false ) {
                    $results[] = array(
                        'path' => $file->getPathname(),
                        'name' => $file->getFilename(),
                        'size' => $file->getSize(),
                        'modified' => $file->getMTime(),
                        'matches' => substr_count( strtolower( $content ), strtolower( $query ) ),
                    );
                    $count++;
                }
            } catch ( Exception $e ) {
                // Skip unreadable files
                continue;
            }
        }

        return $results;
    }

    /**
     * Analyze a file for potential issues
     */
    private function analyze_file( $path ) {
        if ( ! is_file( $path ) ) {
            throw new Exception( 'Not a file.' );
        }

        $extension = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
        $analysis = array(
            'path' => $path,
            'name' => basename( $path ),
            'extension' => $extension,
            'size' => filesize( $path ),
            'modified' => filemtime( $path ),
            'issues' => array(),
            'suggestions' => array(),
        );

        // PHP file analysis
        if ( $extension === 'php' ) {
            $content = file_get_contents( $path );
            if ( $content !== false ) {
                // Check for common issues
                if ( strpos( $content, '@ini_set' ) !== false ) {
                    $analysis['issues'][] = 'Uses @ini_set - can cause compatibility issues';
                }
                if ( strpos( $content, 'eval(' ) !== false ) {
                    $analysis['issues'][] = 'Contains eval() - security risk';
                }
                if ( strpos( $content, 'extract(' ) !== false ) {
                    $analysis['issues'][] = 'Uses extract() - can cause variable conflicts';
                }
                // Check for missing error handling
                if ( preg_match( '/\bmysql_/', $content ) ) {
                    $analysis['issues'][] = 'Uses deprecated mysql_ functions';
                }
            }
        }

        // JavaScript file analysis
        if ( $extension === 'js' ) {
            $content = file_get_contents( $path );
            if ( $content !== false ) {
                if ( strpos( $content, 'alert(' ) !== false ) {
                    $analysis['issues'][] = 'Contains alert() - not suitable for production';
                }
                if ( strpos( $content, 'console.log' ) !== false ) {
                    $analysis['suggestions'][] = 'Contains console.log() - remove for production';
                }
            }
        }

        return $analysis;
    }

    /**
     * Get active plugins information
     */
    private function get_active_plugins_info() {
        if ( ! function_exists( 'get_plugins' ) ) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }

        $plugins = get_plugins();
        $active_plugins = get_option( 'active_plugins' );
        $plugin_info = array();

        foreach ( $active_plugins as $plugin_path ) {
            if ( isset( $plugins[$plugin_path] ) ) {
                $plugin = $plugins[$plugin_path];
                $plugin_info[] = array(
                    'name' => $plugin['Name'],
                    'version' => $plugin['Version'],
                    'path' => $plugin_path,
                );
            }
        }

        return $plugin_info;
    }

    /**
     * Get current theme information
     */
    private function get_current_theme_info() {
        $theme = wp_get_theme();
        return array(
            'name' => $theme->get( 'Name' ),
            'version' => $theme->get( 'Version' ),
            'author' => $theme->get( 'Author' ),
            'stylesheet' => $theme->get_stylesheet(),
            'template' => $theme->get_template(),
        );
    }
}