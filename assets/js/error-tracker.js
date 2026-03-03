/**
 * WooCommerce Comprehensive Monitor - Error Tracker
 * Tracks frontend errors and sends them to the monitoring server
 */

(function($) {
    'use strict';
    
    // Only run if wcm_tracker object is defined
    if (typeof wcm_tracker === 'undefined') {
        return;
    }
    
    // Track JavaScript errors
    if (wcm_tracker.track_js_errors === '1') {
        window.addEventListener('error', function(event) {
            // Don't track errors from external domains (CDNs, etc.)
            if (!event.filename || event.filename.includes(window.location.origin)) {
                reportError({
                    error_type: 'javascript_error',
                    error_message: event.message + ' at ' + event.filename + ':' + event.lineno + ':' + event.colno,
                    page_url: window.location.href,
                    user_agent: navigator.userAgent
                });
            }
        }, true);
        
        // Track unhandled promise rejections
        window.addEventListener('unhandledrejection', function(event) {
            reportError({
                error_type: 'promise_rejection',
                error_message: event.reason ? event.reason.toString() : 'Unhandled promise rejection',
                page_url: window.location.href,
                user_agent: navigator.userAgent
            });
        });
    }
    
    // Track WooCommerce AJAX errors
    if (wcm_tracker.track_ajax_errors === '1') {
        $(document).ajaxError(function(event, jqxhr, settings, error) {
            // Only track WooCommerce-related AJAX requests
            if (settings.url.includes('wc-ajax') || settings.url.includes('admin-ajax.php')) {
                reportError({
                    error_type: 'ajax_error',
                    error_message: error + ' (' + jqxhr.status + ') - URL: ' + settings.url,
                    page_url: window.location.href,
                    user_agent: navigator.userAgent
                });
            }
        });
    }
    
    // Track WooCommerce checkout errors
    if (wcm_tracker.track_checkout_errors === '1' && $('form.woocommerce-checkout').length) {
        // Track checkout form validation errors
        $(document).on('checkout_error', function(event, error_message) {
            var customerEmail = $('#billing_email').val() || '';
            
            reportError({
                error_type: 'checkout_error',
                error_message: error_message,
                page_url: window.location.href,
                user_agent: navigator.userAgent,
                customer_email: customerEmail
            });
        });
        
        // Track payment gateway errors
        $(document.body).on('payment_method_selected', function() {
            // Monitor payment form submissions
            $('form.woocommerce-checkout').on('submit', function() {
                // This would track form submission errors
                // Implementation depends on specific payment gateway
            });
        });
        
        // Track "Place Order" button clicks to detect broken buttons
        $('button[name="woocommerce_checkout_place_order"]').on('click', function() {
            // Store timestamp to detect if button is broken
            localStorage.setItem('wcm_checkout_click', Date.now());
        });
        
        // Check if button was clicked but form wasn't submitted (broken button)
        $(window).on('beforeunload', function() {
            var clickTime = localStorage.getItem('wcm_checkout_click');
            if (clickTime && (Date.now() - clickTime < 5000)) {
                // Button was clicked recently but page is unloading (form not submitted)
                reportError({
                    error_type: 'checkout_button_broken',
                    error_message: 'Checkout button clicked but form not submitted - possible JavaScript error preventing submission',
                    page_url: window.location.href,
                    user_agent: navigator.userAgent
                });
            }
            localStorage.removeItem('wcm_checkout_click');
        });
    }
    
    // Track "Add to Cart" errors
    if (wcm_tracker.track_ajax_errors === '1') {
        $(document.body).on('added_to_cart', function(event, fragments, cart_hash, $button) {
            // Success - clear any pending error
            if ($button) {
                $button.removeData('wcm_add_to_cart_error');
            }
        });
        
        $(document.body).on('ajax_error', function(event, xhr, settings, error) {
            if (settings.url.includes('add_to_cart')) {
                var $button = $(event.target).closest('.ajax_add_to_cart');
                if ($button.length) {
                    // Store error on button to prevent duplicate reports
                    if (!$button.data('wcm_add_to_cart_error')) {
                        $button.data('wcm_add_to_cart_error', true);
                        
                        reportError({
                            error_type: 'ajax_add_to_cart_error',
                            error_message: error + ' - URL: ' + settings.url,
                            page_url: window.location.href,
                            user_agent: navigator.userAgent
                        });
                    }
                }
            }
        });
    }
    
    // Track WooCommerce Blocks checkout errors
    if (typeof wc !== 'undefined' && wc.blocksCheckout) {
        // WooCommerce Blocks uses Fetch API, so we need to intercept fetch calls
        var originalFetch = window.fetch;
        window.fetch = function() {
            var args = arguments;
            var url = typeof args[0] === 'string' ? args[0] : args[0].url;
            
            // Check if this is a WooCommerce Blocks API call
            if (url && url.includes('/wp-json/wc/store/') && url.includes('checkout')) {
                return originalFetch.apply(this, args).then(function(response) {
                    if (!response.ok) {
                        response.clone().json().then(function(data) {
                            reportError({
                                error_type: 'blocks_checkout_error',
                                error_message: 'WooCommerce Blocks checkout error: ' + (data.message || response.statusText),
                                page_url: window.location.href,
                                user_agent: navigator.userAgent
                            });
                        });
                    }
                    return response;
                }).catch(function(error) {
                    reportError({
                        error_type: 'blocks_checkout_fetch_error',
                        error_message: 'WooCommerce Blocks fetch error: ' + error.message,
                        page_url: window.location.href,
                        user_agent: navigator.userAgent
                    });
                    throw error;
                });
            }
            
            return originalFetch.apply(this, args);
        };
    }
    
    // Track form validation errors
    $('form').on('invalid', function(event) {
        if (event.target.checkValidity && !event.target.checkValidity()) {
            reportError({
                error_type: 'form_validation_error',
                error_message: 'Form validation failed for ' + event.target.name + ': ' + event.target.validationMessage,
                page_url: window.location.href,
                user_agent: navigator.userAgent
            });
        }
    }, true);
    
    /**
     * Report error to monitoring server
     */
    function reportError(errorData) {
        // Add store information
        errorData.store_url = wcm_tracker.store_url;
        errorData.store_name = wcm_tracker.store_name;
        errorData.time = new Date().toISOString();
        
        // Try to get order ID from URL or form
        var orderIdMatch = window.location.href.match(/order-received\/(\d+)/);
        if (orderIdMatch) {
            errorData.order_id = orderIdMatch[1];
        }
        
        // Send error to WordPress REST API
        if (wcm_tracker.rest_url) {
            $.ajax({
                url: wcm_tracker.rest_url,
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(errorData),
                timeout: 5000 // 5 second timeout
            }).fail(function(jqxhr, textStatus, error) {
                // If REST API fails, try admin-ajax.php as fallback
                if (wcm_tracker.ajax_url) {
                    $.ajax({
                        url: wcm_tracker.ajax_url,
                        method: 'POST',
                        data: {
                            action: 'wcm_report_error',
                            error_data: JSON.stringify(errorData),
                            nonce: wcm_tracker.nonce
                        },
                        timeout: 5000
                    });
                }
            });
        }
        
        // Also log to console in development
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            console.log('WCM Error Reported:', errorData);
        }
    }
    
    // Initialize error tracking
    $(document).ready(function() {
        // Check for existing error messages on page load
        setTimeout(function() {
            // Check for WooCommerce error notices
            $('.woocommerce-error, .woocommerce-notice--error').each(function() {
                var errorText = $(this).text().trim();
                if (errorText && errorText.length > 0) {
                    reportError({
                        error_type: 'woocommerce_error_notice',
                        error_message: errorText,
                        page_url: window.location.href,
                        user_agent: navigator.userAgent
                    });
                }
            });
            
            // Check for JavaScript console errors that occurred before our handler was set up
            if (window._wcm_early_errors && window._wcm_early_errors.length > 0) {
                window._wcm_early_errors.forEach(function(error) {
                    reportError(error);
                });
                window._wcm_early_errors = [];
            }
        }, 1000);
    });
    
})(jQuery);

// Capture early errors before the script loads
window._wcm_early_errors = window._wcm_early_errors || [];
var originalOnerror = window.onerror;
window.onerror = function(message, source, lineno, colno, error) {
    if (originalOnerror) {
        originalOnerror.apply(this, arguments);
    }
    
    window._wcm_early_errors.push({
        error_type: 'javascript_error',
        error_message: message + ' at ' + source + ':' + lineno + ':' + colno,
        page_url: window.location.href,
        user_agent: navigator.userAgent,
        time: new Date().toISOString()
    });
    
    return false;
};