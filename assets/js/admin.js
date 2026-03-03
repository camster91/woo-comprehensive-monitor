/**
 * WooCommerce Comprehensive Monitor - Admin JavaScript
 */

(function($) {
    'use strict';
    
    // Only run if wcm_admin object is defined
    if (typeof wcm_admin === 'undefined') {
        return;
    }
    
    /**
     * Dashboard functionality
     */
    $(document).ready(function() {
        // Run health check
        $('#wcm-run-health-check, #wcm-run-health-check-now, #wcm-run-first-health-check').on('click', function(e) {
            e.preventDefault();
            
            var $button = $(this);
            var originalText = $button.text();
            
            $button.prop('disabled', true).text(wcm_admin.strings.loading);
            
            $.ajax({
                url: wcm_admin.ajax_url,
                method: 'POST',
                data: {
                    action: 'wcm_run_health_check',
                    nonce: wcm_admin.nonce
                },
                success: function(response) {
                    if (response.success) {
                        showNotice('success', response.data.message);
                        // Reload page after 2 seconds to show updated health score
                        setTimeout(function() {
                            window.location.reload();
                        }, 2000);
                    } else {
                        showNotice('error', wcm_admin.strings.error + ' ' + response.data);
                    }
                },
                error: function() {
                    showNotice('error', wcm_admin.strings.error + ' ' + wcm_admin.strings.ajax_failed);
                },
                complete: function() {
                    $button.prop('disabled', false).text(originalText);
                }
            });
        });
        
        // Send test alert
        $('#wcm-send-test-alert').on('click', function(e) {
            e.preventDefault();
            
            var $button = $(this);
            var originalText = $button.text();
            
            $button.prop('disabled', true).text(wcm_admin.strings.loading);
            
            $.ajax({
                url: wcm_admin.ajax_url,
                method: 'POST',
                data: {
                    action: 'wcm_send_test_alert',
                    nonce: wcm_admin.nonce
                },
                success: function(response) {
                    if (response.success) {
                        showNotice('success', response.data.message);
                    } else {
                        showNotice('error', wcm_admin.strings.error + ' ' + response.data);
                    }
                },
                error: function() {
                    showNotice('error', wcm_admin.strings.error + ' ' + wcm_admin.strings.ajax_failed);
                },
                complete: function() {
                    $button.prop('disabled', false).text(originalText);
                }
            });
        });
        
        // Get dashboard data via AJAX
        $('.wcm-refresh-dashboard').on('click', function() {
            refreshDashboardData();
        });
        
        // Auto-refresh dashboard every 60 seconds
        if ($('.wcm-dashboard').length) {
            setInterval(refreshDashboardData, 60000);
        }
        
        // Health score circles animation
        $('.score-circle, .score-circle-large, .score-circle-medium').each(function() {
            var $circle = $(this);
            var score = $circle.data('score');
            
            // Set CSS variable for conic gradient
            $circle.css('--score', score + '%');
            
            // Animate the score display
            if ($circle.find('.score').length) {
                var $scoreElement = $circle.find('.score');
                var targetScore = parseInt(score);
                var currentScore = 0;
                var increment = targetScore / 50; // Animate over 50 steps
                
                var animateScore = function() {
                    if (currentScore < targetScore) {
                        currentScore += increment;
                        if (currentScore > targetScore) currentScore = targetScore;
                        $scoreElement.text(Math.round(currentScore));
                        setTimeout(animateScore, 20);
                    }
                };
                
                // Start animation after a short delay
                setTimeout(animateScore, 500);
            }
        });
        
        // Settings page functionality
        if ($('.wcm-settings').length) {
            // Test connection button
            $('#wcm-test-connection').on('click', function() {
                var $button = $(this);
                var $result = $('#wcm-test-result');
                var serverUrl = $('#wcm_monitoring_server').val();
                
                if (!serverUrl) {
                    showNotice('error', 'Please enter a monitoring server URL first.');
                    return;
                }
                
                $button.prop('disabled', true).text('Testing...');
                $result.html('');
                
                $.ajax({
                    url: wcm_admin.ajax_url,
                    method: 'POST',
                    data: {
                        action: 'wcm_test_connection',
                        nonce: wcm_admin.nonce,
                        server_url: serverUrl
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
            
            // Toggle advanced options
            $('.wcm-advanced-toggle').on('click', function(e) {
                e.preventDefault();
                $(this).closest('tr').next('.wcm-advanced-options').toggle();
            });
            
            // Validate health check interval
            $('#wcm_health_check_interval').on('change', function() {
                var value = parseInt($(this).val());
                if (value < 300) {
                    showNotice('warning', 'Health check interval should be at least 300 seconds (5 minutes).');
                    $(this).val(300);
                }
            });
        }
        
        // Disputes page functionality
        if ($('.wcm-disputes-header').length) {
            // Check for new disputes
            $('#wcm-check-disputes').on('click', function() {
                var $button = $(this);
                var originalText = $button.text();
                
                $button.prop('disabled', true).text('Checking...');
                
                $.ajax({
                    url: wcm_admin.ajax_url,
                    method: 'POST',
                    data: {
                        action: 'wcm_check_disputes',
                        nonce: wcm_admin.nonce
                    },
                    success: function(response) {
                        if (response.success) {
                            showNotice('success', response.data.message);
                            // Reload page after 2 seconds
                            setTimeout(function() {
                                window.location.reload();
                            }, 2000);
                        } else {
                            showNotice('error', wcm_admin.strings.error + ' ' + response.data);
                        }
                    },
                    error: function() {
                        showNotice('error', wcm_admin.strings.error + ' ' + wcm_admin.strings.ajax_failed);
                    },
                    complete: function() {
                        $button.prop('disabled', false).text(originalText);
                    }
                });
            });
            
            // View evidence modal
            window.wcmViewEvidence = function(evidenceId) {
                $.ajax({
                    url: wcm_admin.ajax_url,
                    method: 'POST',
                    data: {
                        action: 'wcm_get_evidence',
                        nonce: wcm_admin.nonce,
                        evidence_id: evidenceId
                    },
                    success: function(response) {
                        if (response.success) {
                            // Create modal
                            var modalHtml = `
                                <div class="wcm-modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center;">
                                    <div style="background: white; padding: 30px; border-radius: 8px; max-width: 800px; max-height: 80vh; overflow: auto;">
                                        <h2>Dispute Evidence</h2>
                                        <pre style="background: #f5f5f5; padding: 20px; border-radius: 4px; overflow: auto; max-height: 400px;">${JSON.stringify(response.data, null, 2)}</pre>
                                        <div style="text-align: right; margin-top: 20px;">
                                            <button type="button" class="button" onclick="jQuery('.wcm-modal').remove()">Close</button>
                                        </div>
                                    </div>
                                </div>
                            `;
                            $('body').append(modalHtml);
                        } else {
                            showNotice('error', wcm_admin.strings.error + ' ' + response.data);
                        }
                    },
                    error: function() {
                        showNotice('error', wcm_admin.strings.error + ' ' + wcm_admin.strings.ajax_failed);
                    }
                });
            };
        }
        
        // Errors page functionality
        if ($('.wcm-errors-header').length) {
            // Clear logs
            $('#wcm-clear-logs').on('click', function() {
                if (confirm('Are you sure you want to clear all error logs? This action cannot be undone.')) {
                    var $button = $(this);
                    var originalText = $button.text();
                    
                    $button.prop('disabled', true).text('Clearing...');
                    
                    $.ajax({
                        url: wcm_admin.ajax_url,
                        method: 'POST',
                        data: {
                            action: 'wcm_clear_logs',
                            nonce: wcm_admin.nonce
                        },
                        success: function(response) {
                            if (response.success) {
                                showNotice('success', response.data.message);
                                // Reload page after 2 seconds
                                setTimeout(function() {
                                    window.location.reload();
                                }, 2000);
                            } else {
                                showNotice('error', wcm_admin.strings.error + ' ' + response.data);
                            }
                        },
                        error: function() {
                            showNotice('error', wcm_admin.strings.error + ' ' + wcm_admin.strings.ajax_failed);
                        },
                        complete: function() {
                            $button.prop('disabled', false).text(originalText);
                        }
                    });
                }
            });
            
            // Filter errors by type
            $('.wcm-error-filter').on('change', function() {
                var errorType = $(this).val();
                var $table = $('.wp-list-table tbody');
                
                if (errorType === 'all') {
                    $table.find('tr').show();
                } else {
                    $table.find('tr').hide();
                    $table.find('tr td:nth-child(2) code:contains("' + errorType + '")').closest('tr').show();
                }
            });
        }
    });
    
    /**
     * Refresh dashboard data via AJAX
     */
    function refreshDashboardData() {
        $.ajax({
            url: wcm_admin.ajax_url,
            method: 'POST',
            data: {
                action: 'wcm_get_dashboard_data',
                nonce: wcm_admin.nonce
            },
            success: function(response) {
                if (response.success) {
                    updateDashboard(response.data);
                }
            }
        });
    }
    
    /**
     * Update dashboard with new data
     */
    function updateDashboard(data) {
        // Update health score
        if (data.health_score !== undefined) {
            $('.score-circle, .score-circle-large, .score-circle-medium').each(function() {
                var $circle = $(this);
                $circle.data('score', data.health_score);
                $circle.css('--score', data.health_score + '%');
                $circle.find('.score').text(data.health_score);
            });
            
            $('.score-updated').text('Updated: ' + new Date().toLocaleTimeString());
        }
        
        // Update error counts
        if (data.error_stats !== undefined) {
            $('.wcm-stats .stat:nth-child(1) .stat-value').text(data.error_stats.total_errors || 0);
            $('.wcm-stats .stat:nth-child(2) .stat-value').text(data.error_stats.checkout_errors || 0);
            $('.wcm-stats .stat:nth-child(3) .stat-value').text(data.error_stats.js_errors || 0);
        }
        
        // Show refresh notification
        showNotice('info', 'Dashboard refreshed at ' + new Date().toLocaleTimeString(), 3000);
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
    
})(jQuery);