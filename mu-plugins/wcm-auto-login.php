<?php
/**
 * Plugin Name: WCM Auto Login
 * Description: One-time token login for WooCommerce Monitor dashboard — logs admin into wp-admin remotely
 * Version: 1.0.0
 * Author: Cameron @ Ashbi
 */

if (!defined('ABSPATH')) exit;

// Store tokens in a transient (auto-expires)
define('WCM_LOGIN_TOKEN_PREFIX', 'wcm_login_token_');
define('WCM_LOGIN_TOKEN_EXPIRY', 60); // 60 seconds to use the token

add_action('rest_api_init', function() {
    // Generate a one-time login token (called from monitoring server)
    register_rest_route('wcm/v1', '/auto-login/generate', array(
        'methods'  => 'POST',
        'callback' => 'wcm_generate_login_token',
        'permission_callback' => function() {
            return current_user_can('manage_options');
        },
    ));
});

/**
 * Generate a one-time login token for the admin user
 */
function wcm_generate_login_token($request) {
    // Find the admin user (prefer cameron@ashbi.ca, fallback to first admin)
    $admin_user = get_user_by('email', 'cameron@ashbi.ca');
    if (!$admin_user) {
        $admins = get_users(array('role' => 'administrator', 'number' => 1, 'orderby' => 'ID', 'order' => 'ASC'));
        $admin_user = !empty($admins) ? $admins[0] : null;
    }
    if (!$admin_user) {
        return new WP_Error('no_admin', 'No administrator found', array('status' => 500));
    }

    // Generate a secure one-time token
    $token = wp_generate_password(64, false);
    $token_hash = hash('sha256', $token);

    // Store with expiry
    set_transient(WCM_LOGIN_TOKEN_PREFIX . $token_hash, array(
        'user_id'    => $admin_user->ID,
        'created_at' => time(),
        'ip'         => $_SERVER['REMOTE_ADDR'] ?? '',
    ), WCM_LOGIN_TOKEN_EXPIRY);

    $login_url = add_query_arg(array(
        'wcm_auto_login' => $token,
    ), site_url('/'));

    return array(
        'status'    => 'ok',
        'login_url' => $login_url,
        'expires'   => WCM_LOGIN_TOKEN_EXPIRY,
        'user'      => $admin_user->user_login,
    );
}

/**
 * Handle the auto-login redirect (front-end URL, no REST)
 */
add_action('init', function() {
    if (empty($_GET['wcm_auto_login'])) return;

    $token = sanitize_text_field($_GET['wcm_auto_login']);
    $token_hash = hash('sha256', $token);
    $data = get_transient(WCM_LOGIN_TOKEN_PREFIX . $token_hash);

    if (!$data || empty($data['user_id'])) {
        wp_die(
            'This login link has expired or already been used. Please generate a new one from the dashboard.',
            'Login Expired',
            array('response' => 403)
        );
    }

    // Delete the token immediately (one-time use)
    delete_transient(WCM_LOGIN_TOKEN_PREFIX . $token_hash);

    // Verify user exists
    $user = get_user_by('id', $data['user_id']);
    if (!$user) {
        wp_die('User not found.', 'Error', array('response' => 403));
    }

    // Log in the user
    wp_clear_auth_cookie();
    wp_set_current_user($user->ID);
    wp_set_auth_cookie($user->ID, true);
    do_action('wp_login', $user->user_login, $user);

    // Redirect to wp-admin
    $redirect = $_GET['redirect'] ?? admin_url();
    wp_safe_redirect($redirect);
    exit;
}, 1); // Priority 1 = very early
