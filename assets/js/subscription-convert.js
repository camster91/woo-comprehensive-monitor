(function($) {
    'use strict';

    // Convert to One-Time button
    $(document).on('click', '.wcm-convert-btn', function(e) {
        e.preventDefault();
        var subId = $(this).data('sub-id');
        showConvertModal(subId);
    });

    // Cancel button
    $(document).on('click', '.wcm-cancel-btn', function(e) {
        e.preventDefault();
        var subId = $(this).data('sub-id');
        var cancelUrl = $(this).data('cancel-url');
        showCancelModal(subId, cancelUrl);
    });

    function showConvertModal(subId) {
        // Remove existing modal
        $('#wcm-convert-modal').remove();

        var modal = $(
            '<div id="wcm-convert-modal" class="wcm-modal-overlay">' +
                '<div class="wcm-modal">' +
                    '<div class="wcm-modal-header">' +
                        '<h3>Switch to One-Time Purchase</h3>' +
                        '<button class="wcm-modal-close">&times;</button>' +
                    '</div>' +
                    '<div class="wcm-modal-body">' +
                        '<div class="wcm-loading">Loading pricing details...</div>' +
                    '</div>' +
                '</div>' +
            '</div>'
        );

        $('body').append(modal);
        modal.fadeIn(200);

        // Fetch pricing details
        $.post(wcm_convert.ajax_url, {
            action: 'wcm_get_convert_details',
            nonce: wcm_convert.nonce,
            subscription_id: subId
        }, function(response) {
            if (!response.success) {
                modal.find('.wcm-modal-body').html(
                    '<p class="wcm-error">' + (response.data?.message || 'Error loading details') + '</p>' +
                    '<button class="wcm-modal-close-btn button">Close</button>'
                );
                return;
            }

            var d = response.data;
            var diffText = d.difference > 0
                ? '<div class="wcm-price-row wcm-price-diff">' +
                    '<span>Difference to pay now:</span>' +
                    '<span class="wcm-price">' + d.currency_symbol + d.difference.toFixed(2) + '</span>' +
                  '</div>' +
                  '<p class="wcm-note">This will be charged to your card on file.</p>'
                : '<p class="wcm-note wcm-note-good">No additional charge needed!</p>';

            modal.find('.wcm-modal-body').html(
                '<p class="wcm-product-name">' + d.product_name + '</p>' +
                '<div class="wcm-price-breakdown">' +
                    '<div class="wcm-price-row">' +
                        '<span>Your subscription price:</span>' +
                        '<span class="wcm-price">' + d.currency_symbol + d.subscription_price.toFixed(2) + '</span>' +
                    '</div>' +
                    '<div class="wcm-price-row">' +
                        '<span>Regular one-time price:</span>' +
                        '<span class="wcm-price">' + d.currency_symbol + d.regular_price.toFixed(2) + '</span>' +
                    '</div>' +
                    diffText +
                '</div>' +
                '<p class="wcm-warning">Your subscription will be cancelled immediately after conversion.</p>' +
                '<div class="wcm-modal-actions">' +
                    '<button class="wcm-confirm-convert button alt" data-sub-id="' + subId + '">Confirm Conversion</button>' +
                    '<button class="wcm-modal-close-btn button">Keep Subscription</button>' +
                '</div>'
            );
        });
    }

    function showCancelModal(subId, cancelUrl) {
        $('#wcm-cancel-modal').remove();

        var modal = $(
            '<div id="wcm-cancel-modal" class="wcm-modal-overlay">' +
                '<div class="wcm-modal">' +
                    '<div class="wcm-modal-header">' +
                        '<h3>Cancel Subscription</h3>' +
                        '<button class="wcm-modal-close">&times;</button>' +
                    '</div>' +
                    '<div class="wcm-modal-body">' +
                        '<p>Are you sure you want to cancel your subscription?</p>' +
                        '<p class="wcm-warning">You will lose your subscription discount rate.</p>' +
                        '<div class="wcm-cancel-reason">' +
                            '<label for="wcm-cancel-reason">Reason for cancellation (optional):</label>' +
                            '<select id="wcm-cancel-reason">' +
                                '<option value="">Select a reason...</option>' +
                                '<option value="too_expensive">Too expensive</option>' +
                                '<option value="not_needed">No longer needed</option>' +
                                '<option value="found_alternative">Found an alternative</option>' +
                                '<option value="product_issue">Issue with product</option>' +
                                '<option value="shipping_issue">Shipping issues</option>' +
                                '<option value="other">Other</option>' +
                            '</select>' +
                        '</div>' +
                        '<div class="wcm-convert-offer">' +
                            '<p><strong>Instead of cancelling,</strong> you can switch to a one-time purchase and keep your current product.</p>' +
                            '<button class="wcm-switch-to-convert button" data-sub-id="' + subId + '">Switch to One-Time Purchase</button>' +
                        '</div>' +
                        '<div class="wcm-modal-actions">' +
                            '<button class="wcm-confirm-cancel button" data-sub-id="' + subId + '">Yes, Cancel Subscription</button>' +
                            '<button class="wcm-modal-close-btn button alt">Keep Subscription</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>'
        );

        $('body').append(modal);
        modal.fadeIn(200);
    }

    // Confirm conversion
    $(document).on('click', '.wcm-confirm-convert', function() {
        var $btn = $(this);
        var subId = $btn.data('sub-id');
        $btn.prop('disabled', true).text('Processing...');

        $.post(wcm_convert.ajax_url, {
            action: 'wcm_convert_to_onetime',
            nonce: wcm_convert.nonce,
            subscription_id: subId
        }, function(response) {
            if (response.success) {
                $('.wcm-modal-body').html(
                    '<div class="wcm-success">' +
                        '<p>' + response.data.message + '</p>' +
                        '<button class="wcm-reload button alt">Done</button>' +
                    '</div>'
                );
            } else {
                $btn.prop('disabled', false).text('Confirm Conversion');
                alert(response.data?.message || 'An error occurred. Please try again.');
            }
        }).fail(function() {
            $btn.prop('disabled', false).text('Confirm Conversion');
            alert('Connection error. Please try again.');
        });
    });

    // Confirm cancel
    $(document).on('click', '.wcm-confirm-cancel', function() {
        var $btn = $(this);
        var subId = $btn.data('sub-id');
        var reason = $('#wcm-cancel-reason').val();
        $btn.prop('disabled', true).text('Cancelling...');

        $.post(wcm_convert.ajax_url, {
            action: 'wcm_cancel_subscription',
            nonce: wcm_convert.nonce,
            subscription_id: subId,
            reason: reason
        }, function(response) {
            if (response.success) {
                $('.wcm-modal-body').html(
                    '<div class="wcm-success">' +
                        '<p>' + response.data.message + '</p>' +
                        '<button class="wcm-reload button alt">Done</button>' +
                    '</div>'
                );
            } else {
                $btn.prop('disabled', false).text('Yes, Cancel Subscription');
                alert(response.data?.message || 'An error occurred.');
            }
        });
    });

    // Switch from cancel modal to convert modal
    $(document).on('click', '.wcm-switch-to-convert', function() {
        var subId = $(this).data('sub-id');
        $('#wcm-cancel-modal').remove();
        showConvertModal(subId);
    });

    // Close modals
    $(document).on('click', '.wcm-modal-close, .wcm-modal-close-btn', function() {
        $('.wcm-modal-overlay').fadeOut(200, function() { $(this).remove(); });
    });
    $(document).on('click', '.wcm-modal-overlay', function(e) {
        if ($(e.target).hasClass('wcm-modal-overlay')) {
            $(this).fadeOut(200, function() { $(this).remove(); });
        }
    });

    // Reload page after success
    $(document).on('click', '.wcm-reload', function() {
        window.location.reload();
    });

})(jQuery);
