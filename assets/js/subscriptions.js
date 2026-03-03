/**
 * WooCommerce Comprehensive Monitor - Subscription Management JavaScript
 */

(function($) {
    'use strict';
    
    // Only run if wcm_subscriptions object is defined
    if (typeof wcm_subscriptions === 'undefined') {
        return;
    }
    
    /**
     * Initialize subscription management
     */
    $(document).ready(function() {
        // Search subscriptions
        $('#wcm-search-subscriptions').on('click', function(e) {
            e.preventDefault();
            searchSubscriptions();
        });
        
        // Search on Enter key
        $('#wcm-subscription-search').on('keypress', function(e) {
            if (e.which === 13) {
                e.preventDefault();
                searchSubscriptions();
            }
        });
        
        // View subscription details
        $(document).on('click', '.wcm-view-subscription', function(e) {
            e.preventDefault();
            var subscriptionId = $(this).data('subscription-id');
            viewSubscriptionDetails(subscriptionId);
        });
        
        // Refresh subscription details
        $(document).on('click', '.wcm-refresh-details', function(e) {
            e.preventDefault();
            var subscriptionId = $(this).data('subscription-id');
            viewSubscriptionDetails(subscriptionId);
        });
        
        // Cancel subscription
        $(document).on('click', '.wcm-cancel-subscription', function(e) {
            e.preventDefault();
            var subscriptionId = $(this).data('subscription-id');
            cancelSubscription(subscriptionId);
        });
        
        // Update subscription status
        $(document).on('click', '.wcm-update-status', function(e) {
            e.preventDefault();
            var subscriptionId = $(this).data('subscription-id');
            var status = $(this).data('status');
            updateSubscriptionStatus(subscriptionId, status);
        });
        
        // Add subscription note
        $(document).on('click', '.wcm-add-subscription-note', function(e) {
            e.preventDefault();
            var subscriptionId = $(this).data('subscription-id');
            addSubscriptionNote(subscriptionId);
        });
        
        // Close modal
        $(document).on('click', '.wcm-modal-close, .wcm-modal-backdrop', function(e) {
            e.preventDefault();
            closeModal();
        });
        
        // Close modal on Escape key
        $(document).on('keydown', function(e) {
            if (e.key === 'Escape' && $('.wcm-modal').length) {
                closeModal();
            }
        });
    });
    
    /**
     * Search subscriptions
     */
    function searchSubscriptions() {
        var searchTerm = $('#wcm-subscription-search').val();
        var statusFilter = $('#wcm-search-filter').val();
        
        var $results = $('#wcm-search-results');
        var $button = $('#wcm-search-subscriptions');
        var originalText = $button.text();
        
        $button.prop('disabled', true).text(wcm_subscriptions.strings.searching);
        $results.html('<div class="wcm-loading"><div class="spinner is-active"></div><p>' + wcm_subscriptions.strings.loading + '</p></div>');
        
        $.ajax({
            url: wcm_subscriptions.ajax_url,
            method: 'POST',
            data: {
                action: 'wcm_search_subscriptions',
                nonce: wcm_subscriptions.nonce,
                search: searchTerm,
                status: statusFilter
            },
            success: function(response) {
                if (response.success) {
                    $results.html(response.data.html);
                    // Hide subscription details when showing new search results
                    $('#wcm-subscription-details').hide();
                } else {
                    showNotice('error', wcm_subscriptions.strings.error + ' ' + response.data);
                }
            },
            error: function() {
                showNotice('error', wcm_subscriptions.strings.error + ' ' + wcm_subscriptions.strings.ajax_failed);
                $results.html('<div class="notice notice-error"><p>' + wcm_subscriptions.strings.error + ' ' + wcm_subscriptions.strings.ajax_failed + '</p></div>');
            },
            complete: function() {
                $button.prop('disabled', false).text(originalText);
            }
        });
    }
    
    /**
     * View subscription details
     */
    function viewSubscriptionDetails(subscriptionId) {
        var $details = $('#wcm-subscription-details');
        
        $details.html('<div class="wcm-loading"><div class="spinner is-active"></div><p>' + wcm_subscriptions.strings.loading + '</p></div>').show();
        
        // Scroll to details section
        $('html, body').animate({
            scrollTop: $details.offset().top - 20
        }, 300);
        
        $.ajax({
            url: wcm_subscriptions.ajax_url,
            method: 'POST',
            data: {
                action: 'wcm_get_subscription_details',
                nonce: wcm_subscriptions.nonce,
                subscription_id: subscriptionId
            },
            success: function(response) {
                if (response.success) {
                    $details.html(response.data.html);
                } else {
                    showNotice('error', wcm_subscriptions.strings.error + ' ' + response.data);
                    $details.hide();
                }
            },
            error: function() {
                showNotice('error', wcm_subscriptions.strings.error + ' ' + wcm_subscriptions.strings.ajax_failed);
                $details.hide();
            }
        });
    }
    
    /**
     * Cancel subscription
     */
    function cancelSubscription(subscriptionId) {
        if (!confirm(wcm_subscriptions.strings.confirm_cancel)) {
            return;
        }
        
        $.ajax({
            url: wcm_subscriptions.ajax_url,
            method: 'POST',
            data: {
                action: 'wcm_cancel_subscription',
                nonce: wcm_subscriptions.nonce,
                subscription_id: subscriptionId
            },
            success: function(response) {
                if (response.success) {
                    showNotice('success', response.data.message);
                    // Refresh subscription details
                    viewSubscriptionDetails(subscriptionId);
                } else {
                    showNotice('error', wcm_subscriptions.strings.error + ' ' + response.data);
                }
            },
            error: function() {
                showNotice('error', wcm_subscriptions.strings.error + ' ' + wcm_subscriptions.strings.ajax_failed);
            }
        });
    }
    
    /**
     * Update subscription status
     */
    function updateSubscriptionStatus(subscriptionId, status) {
        if (!confirm(wcm_subscriptions.strings.confirm_update)) {
            return;
        }
        
        $.ajax({
            url: wcm_subscriptions.ajax_url,
            method: 'POST',
            data: {
                action: 'wcm_update_subscription_status',
                nonce: wcm_subscriptions.nonce,
                subscription_id: subscriptionId,
                status: status
            },
            success: function(response) {
                if (response.success) {
                    showNotice('success', response.data.message);
                    // Refresh subscription details
                    viewSubscriptionDetails(subscriptionId);
                } else {
                    showNotice('error', wcm_subscriptions.strings.error + ' ' + response.data);
                }
            },
            error: function() {
                showNotice('error', wcm_subscriptions.strings.error + ' ' + wcm_subscriptions.strings.ajax_failed);
            }
        });
    }
    
    /**
     * Add subscription note
     */
    function addSubscriptionNote(subscriptionId) {
        var noteContent = $('#wcm-new-note').val();
        
        if (!noteContent.trim()) {
            showNotice('error', 'Please enter note content');
            return;
        }
        
        $.ajax({
            url: wcm_subscriptions.ajax_url,
            method: 'POST',
            data: {
                action: 'wcm_add_subscription_note',
                nonce: wcm_subscriptions.nonce,
                subscription_id: subscriptionId,
                note: noteContent
            },
            success: function(response) {
                if (response.success) {
                    showNotice('success', response.data.message);
                    // Clear note field
                    $('#wcm-new-note').val('');
                    // Refresh subscription details
                    viewSubscriptionDetails(subscriptionId);
                } else {
                    showNotice('error', wcm_subscriptions.strings.error + ' ' + response.data);
                }
            },
            error: function() {
                showNotice('error', wcm_subscriptions.strings.error + ' ' + wcm_subscriptions.strings.ajax_failed);
            }
        });
    }
    
    /**
     * Show modal with subscription orders
     */
    function showSubscriptionOrders(subscriptionId) {
        $.ajax({
            url: wcm_subscriptions.ajax_url,
            method: 'POST',
            data: {
                action: 'wcm_get_subscription_orders',
                nonce: wcm_subscriptions.nonce,
                subscription_id: subscriptionId
            },
            success: function(response) {
                if (response.success) {
                    var modalHtml = `
                        <div class="wcm-modal">
                            <div class="wcm-modal-backdrop"></div>
                            <div class="wcm-modal-content">
                                <div class="wcm-modal-header">
                                    <h2>Subscription Orders</h2>
                                    <button type="button" class="wcm-modal-close">&times;</button>
                                </div>
                                <div class="wcm-modal-body">
                                    ${response.data.html}
                                </div>
                                <div class="wcm-modal-footer">
                                    <button type="button" class="button wcm-modal-close">Close</button>
                                </div>
                            </div>
                        </div>
                    `;
                    $('body').append(modalHtml);
                } else {
                    showNotice('error', wcm_subscriptions.strings.error + ' ' + response.data);
                }
            },
            error: function() {
                showNotice('error', wcm_subscriptions.strings.error + ' ' + wcm_subscriptions.strings.ajax_failed);
            }
        });
    }
    
    /**
     * Close modal
     */
    function closeModal() {
        $('.wcm-modal').remove();
    }
    
    /**
     * Show notice message
     */
    function showNotice(type, message, duration) {
        // Remove existing notices
        $('.wcm-notice').remove();
        
        // Create notice
        var noticeClass = 'notice-' + type;
        var noticeHtml = `
            <div class="notice wcm-notice ${noticeClass} is-dismissible" style="margin: 10px 0; padding: 10px 15px;">
                <p>${message}</p>
                <button type="button" class="notice-dismiss" onclick="jQuery(this).closest('.wcm-notice').remove()">
                    <span class="screen-reader-text">Dismiss</span>
                </button>
            </div>
        `;
        
        // Add notice to page
        if ($('.wrap h1').length) {
            $('.wrap h1').after(noticeHtml);
        } else {
            $('.wrap').prepend(noticeHtml);
        }
        
        // Auto-remove after duration
        if (duration) {
            setTimeout(function() {
                $('.wcm-notice').fadeOut(300, function() {
                    $(this).remove();
                });
            }, duration);
        }
    }
    
    /**
     * Format currency
     */
    function formatCurrency(amount, currency) {
        // Simple currency formatting
        // In a real implementation, you would use WooCommerce's currency formatting
        return '$' + parseFloat(amount).toFixed(2);
    }
    
    /**
     * Format date
     */
    function formatDate(timestamp) {
        var date = new Date(timestamp * 1000);
        return date.toLocaleDateString();
    }
    
    /**
     * Get subscription status badge
     */
    function getStatusBadge(status) {
        var badges = {
            'active': '<span class="subscription-status status-active">Active</span>',
            'pending': '<span class="subscription-status status-pending">Pending</span>',
            'on-hold': '<span class="subscription-status status-on-hold">On Hold</span>',
            'cancelled': '<span class="subscription-status status-cancelled">Cancelled</span>',
            'expired': '<span class="subscription-status status-expired">Expired</span>',
        };
        
        return badges[status] || '<span class="subscription-status">' + status + '</span>';
    }
    
    /**
     * Get order status badge
     */
    function getOrderStatusBadge(status) {
        var badges = {
            'completed': '<span class="order-status status-completed">Completed</span>',
            'processing': '<span class="order-status status-processing">Processing</span>',
            'pending': '<span class="order-status status-pending">Pending</span>',
            'failed': '<span class="order-status status-failed">Failed</span>',
            'cancelled': '<span class="order-status status-cancelled">Cancelled</span>',
            'refunded': '<span class="order-status status-refunded">Refunded</span>',
        };
        
        return badges[status] || '<span class="order-status">' + status + '</span>';
    }
    
})(jQuery);