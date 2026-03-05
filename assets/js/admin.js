/* WooCommerce Comprehensive Monitor Admin JS */

jQuery(document).ready(function($) {
    'use strict';

    if (typeof wcm_ajax === 'undefined') return;

    // Run Health Check
    $(document).on('click', '#wcm-run-health-check', function() {
        var $btn = $(this), $result = $('#wcm-action-result');
        $btn.prop('disabled', true).text('Running...');
        $result.text('');

        $.ajax({
            url: wcm_ajax.ajax_url,
            type: 'POST',
            data: { action: 'wcm_run_health_check', nonce: wcm_ajax.nonce },
            success: function(response) {
                $result.text(response.success ? (response.data.message || 'Done') : 'Failed').css('color', response.success ? '#4CAF50' : '#F44336');
                if (response.success) setTimeout(function(){ location.reload(); }, 1000);
            },
            error: function() { $result.text('Error').css('color', '#F44336'); },
            complete: function() { $btn.prop('disabled', false).text('Run Health Check'); }
        });
    });

    // Clear Error Logs
    $(document).on('click', '#wcm-clear-errors', function() {
        var $btn = $(this), $result = $('#wcm-clear-result');
        $btn.prop('disabled', true);

        $.ajax({
            url: wcm_ajax.ajax_url,
            type: 'POST',
            data: { action: 'wcm_clear_error_logs', nonce: wcm_ajax.nonce },
            success: function(response) {
                $result.text(response.success ? 'Cleared!' : 'Failed').css('color', response.success ? '#4CAF50' : '#F44336');
                if (response.success) setTimeout(function(){ location.reload(); }, 1000);
            },
            complete: function() { $btn.prop('disabled', false); }
        });
    });

    // Generate Evidence
    $(document).on('click', '.wcm-generate-evidence', function(e) {
        e.preventDefault();
        var $btn = $(this), disputeId = $btn.data('dispute-id');
        $btn.prop('disabled', true).text('Generating...');

        $.ajax({
            url: wcm_ajax.ajax_url,
            type: 'POST',
            data: { action: 'wcm_generate_evidence', dispute_id: disputeId, nonce: wcm_ajax.nonce },
            success: function(response) {
                if (response.success) { setTimeout(function(){ location.reload(); }, 1000); }
                else { $btn.prop('disabled', false).text('Retry'); alert(response.data.message || 'Failed'); }
            },
            error: function() { $btn.prop('disabled', false).text('Retry'); }
        });
    });

    // Manual Evidence Form
    $('#wcm-manual-evidence-form').on('submit', function(e) {
        e.preventDefault();
        var orderId = $('#manual_order_id').val();
        var stripeId = $('#manual_dispute_id').val();
        var $btn = $(this).find('input[type="submit"], button[type="submit"]');

        if (!orderId) { alert('Enter an Order ID'); return; }
        $btn.prop('disabled', true).val('Generating...');

        $.ajax({
            url: wcm_ajax.ajax_url,
            type: 'POST',
            data: { action: 'wcm_create_dispute', order_id: orderId, stripe_dispute_id: stripeId, nonce: wcm_ajax.nonce },
            success: function(response) {
                if (response.success) { alert(response.data.message || 'Done'); location.reload(); }
                else { alert(response.data.message || 'Failed'); $btn.prop('disabled', false).val('Generate Evidence'); }
            },
            error: function() { $btn.prop('disabled', false).val('Generate Evidence'); }
        });
    });

    // Status Modal
    var $modal = $('#wcm-status-modal');

    $(document).on('click', '.wcm-update-status', function(e) {
        e.preventDefault();
        $('#wcm-modal-dispute-id').val($(this).data('dispute-id'));
        $('#wcm-new-status').val($(this).data('current-status'));
        $modal.show();
    });

    $modal.on('click', '.wcm-modal-close, .wcm-modal-cancel', function() { $modal.hide(); });
    $modal.on('click', function(e) { if ($(e.target).is($modal)) $modal.hide(); });

    $('#wcm-save-status').on('click', function() {
        var $btn = $(this);
        $btn.prop('disabled', true).text('Saving...');

        $.ajax({
            url: wcm_ajax.ajax_url,
            type: 'POST',
            data: {
                action: 'wcm_update_dispute_status',
                dispute_id: $('#wcm-modal-dispute-id').val(),
                status: $('#wcm-new-status').val(),
                nonce: wcm_ajax.nonce
            },
            success: function(response) {
                $modal.hide();
                $btn.prop('disabled', false).text('Save');
                if (response.success) { location.reload(); }
                else { alert(response.data.message || 'Failed'); }
            },
            error: function() { $modal.hide(); $btn.prop('disabled', false).text('Save'); }
        });
    });

    // Fix Issues (Action Scheduler, WP-Cron, etc.)
    $(document).on('click', '.wcm-fix-issue', function() {
        var $btn = $(this), $fixItem = $btn.closest('.wcm-fix-item');
        var action = $btn.data('action');
        $btn.prop('disabled', true).text('Fixing...');

        $.ajax({
            url: wcm_ajax.ajax_url,
            type: 'POST',
            data: { 
                action: 'wcm_fix_' + action, 
                nonce: wcm_ajax.nonce 
            },
            success: function(response) {
                if (response.success) {
                    $fixItem.css('border-left-color', '#4CAF50');
                    $fixItem.find('strong').css('color', '#4CAF50');
                    $btn.remove();
                    $fixItem.append('<div style="color:#4CAF50;font-weight:bold;margin-top:5px;">✅ ' + (response.data.message || 'Fixed') + '</div>');
                    
                    // Show results if available
                    if (response.data.results) {
                        var results = response.data.results;
                        var resultText = '';
                        if (results.cleaned_failed !== undefined) {
                            resultText += 'Cleaned ' + results.cleaned_failed + ' failed tasks. ';
                        }
                        if (results.cleaned_old !== undefined) {
                            resultText += 'Cleaned ' + results.cleaned_old + ' old tasks. ';
                        }
                        if (results.total_before !== undefined && results.total_after !== undefined) {
                            resultText += 'Total tasks: ' + results.total_before + ' → ' + results.total_after;
                        }
                        if (resultText) {
                            $fixItem.append('<p style="font-size:12px;color:#666;margin-top:3px;">' + resultText + '</p>');
                        }
                    }
                } else {
                    $btn.prop('disabled', false).text('Try Again');
                    $fixItem.append('<div style="color:#F44336;margin-top:5px;">Failed: ' + (response.data.message || 'Unknown error') + '</div>');
                }
            },
            error: function() {
                $btn.prop('disabled', false).text('Try Again');
                $fixItem.append('<div style="color:#F44336;margin-top:5px;">AJAX error. Please try again.</div>');
            }
        });
    });
});
