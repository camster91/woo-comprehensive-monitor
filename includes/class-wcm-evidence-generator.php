<?php
/**
 * Evidence Generator — creates HTML evidence documents for disputes
 * Ported from woo-dispute-evidence plugin
 *
 * @package WooComprehensiveMonitor
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

class WCM_Evidence_Generator {

    public function __construct() {
        // Ensure upload directory exists
        $dir = WCM_Helpers::get_upload_dir();
        if ( ! file_exists( $dir ) ) {
            wp_mkdir_p( $dir );
            file_put_contents( $dir . '.htaccess', "Order deny,allow\nDeny from all\n" );
            file_put_contents( $dir . 'index.php', '<?php // Silence is golden' );
        }
    }

    /**
     * Generate evidence for a dispute
     *
     * @param int    $order_id
     * @param string $stripe_dispute_id
     * @param string $dispute_reason
     * @param int    $evidence_id Existing DB record ID to update
     * @return array|false
     */
    public function generate_evidence( $order_id, $stripe_dispute_id = '', $dispute_reason = '', $evidence_id = null ) {
        $order = wc_get_order( $order_id );
        if ( ! $order ) {
            WCM_Helpers::log( "Order {$order_id} not found for evidence generation", 'error' );
            return false;
        }

        $customer_email    = $order->get_billing_email();
        $subscription_orders = WCM_Helpers::get_customer_subscription_orders( $customer_email );

        $customer_id    = $order->get_customer_id();
        $acknowledgments = $customer_id ? WCM_Helpers::get_acknowledgments( $customer_id, $order_id ) : array();

        // Generate HTML content
        $evidence_content = $this->generate_evidence_html( $order, $subscription_orders, $acknowledgments, $stripe_dispute_id, $dispute_reason );

        // Save file
        $filename = WCM_Helpers::generate_evidence_filename( $stripe_dispute_id ?: 'manual', $order_id );
        $filepath = WCM_Helpers::get_upload_dir() . $filename;

        if ( false === file_put_contents( $filepath, $evidence_content ) ) {
            WCM_Helpers::log( "Failed to write evidence file: {$filepath}", 'error' );
            return false;
        }

        // Generate rebuttal text
        $rebuttal = $this->generate_rebuttal_text( $order, $subscription_orders, $acknowledgments, $dispute_reason );

        // Save to database
        global $wpdb;
        $table = $wpdb->prefix . 'wcm_dispute_evidence';
        $data  = array(
            'dispute_id'         => $stripe_dispute_id ?: 'manual_' . $order_id . '_' . time(),
            'order_id'           => $order_id,
            'customer_email'     => $customer_email,
            'stripe_dispute_id'  => $stripe_dispute_id,
            'evidence_file_path' => $filepath,
            'evidence_file_url'  => WCM_Helpers::get_upload_url() . $filename,
            'status'             => 'evidence_generated',
            'updated_at'         => current_time( 'mysql' ),
        );

        if ( $evidence_id ) {
            $wpdb->update( $table, $data, array( 'id' => $evidence_id ) );
            $new_id = $evidence_id;
        } else {
            $data['created_at'] = current_time( 'mysql' );
            $wpdb->insert( $table, $data );
            $new_id = $wpdb->insert_id;
        }

        if ( $new_id ) {
            // Send email notification
            $admin_email = get_option( 'wcm_alert_email', get_bloginfo( 'admin_email' ) );
            $subject     = sprintf( '[%s] Dispute Evidence Generated for Order #%d', get_bloginfo( 'name' ), $order_id );
            $message     = sprintf(
                "Evidence generated for Order #%d\n\nCustomer: %s\nAmount: %s\nFile: %s\n\nDashboard: %s",
                $order_id,
                $customer_email,
                $order->get_formatted_order_total(),
                $data['evidence_file_url'],
                admin_url( 'admin.php?page=wcm-disputes' )
            );
            wp_mail( $admin_email, $subject, $message );

            // Also send to monitoring server
            $this->send_to_monitoring_server( $order, $stripe_dispute_id );

            return array(
                'id'            => $new_id,
                'file_path'     => $filepath,
                'file_url'      => $data['evidence_file_url'],
                'rebuttal_text' => $rebuttal,
            );
        }

        return false;
    }

    private function send_to_monitoring_server( $order, $stripe_dispute_id ) {
        $server = get_option( 'wcm_monitoring_server', '' );
        if ( empty( $server ) ) {
            return;
        }

        wp_remote_post( $server, array(
            'method'      => 'POST',
            'timeout'     => 5,
            'blocking'    => false,
            'headers'     => array( 'Content-Type' => 'application/json' ),
            'body'        => wp_json_encode( array(
                'type'               => 'dispute_created',
                'store_url'          => home_url(),
                'store_name'         => get_bloginfo( 'name' ),
                'dispute_id'         => $stripe_dispute_id,
                'order_id'           => $order->get_id(),
                'customer_email'     => $order->get_billing_email(),
                'amount'             => $order->get_total(),
                'currency'           => $order->get_currency(),
                'evidence_generated' => true,
                'timestamp'          => current_time( 'mysql' ),
            ) ),
            'data_format' => 'body',
        ) );
    }

    private function generate_evidence_html( $order, $subscription_orders, $acknowledgments, $stripe_dispute_id, $dispute_reason ) {
        $site_name    = get_bloginfo( 'name' );
        $current_date = date_i18n( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ) );

        ob_start();
        ?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><title>Dispute Evidence — Order #<?php echo esc_html( $order->get_id() ); ?></title>
<style>
body{font-family:Arial,sans-serif;line-height:1.6;margin:0;padding:20px;color:#333}
.container{max-width:1000px;margin:0 auto;background:#fff;padding:30px;border:1px solid #ddd}
.header{text-align:center;border-bottom:2px solid #4a6fa5;padding-bottom:20px;margin-bottom:30px}
.header h1{color:#4a6fa5;margin:0 0 10px}
.section{margin-bottom:30px}
.section h2{color:#4a6fa5;border-bottom:1px solid #eee;padding-bottom:10px}
table{width:100%;border-collapse:collapse;margin:15px 0}
th,td{padding:12px 15px;text-align:left;border-bottom:1px solid #ddd}
th{background:#f8f9fa;font-weight:bold}
.highlight{background:#fff3cd;padding:15px;border-left:4px solid #ffc107;margin:15px 0}
.footer{margin-top:40px;padding-top:20px;border-top:1px solid #ddd;text-align:center;font-size:14px;color:#666}
</style>
</head>
<body>
<div class="container">
<div class="header">
<h1>Dispute Evidence Documentation</h1>
<div><?php echo esc_html( $site_name ); ?> | Generated: <?php echo esc_html( $current_date ); ?></div>
</div>

<div class="section">
<h2>Dispute Summary</h2>
<table>
<tr><th>Order ID:</th><td>#<?php echo esc_html( $order->get_id() ); ?></td></tr>
<?php if ( $stripe_dispute_id ) : ?><tr><th>Stripe Dispute:</th><td><?php echo esc_html( $stripe_dispute_id ); ?></td></tr><?php endif; ?>
<tr><th>Order Date:</th><td><?php echo $order->get_date_created() ? esc_html( $order->get_date_created()->date_i18n( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ) ) ) : '—'; ?></td></tr>
<tr><th>Status:</th><td><?php echo esc_html( ucfirst( $order->get_status() ) ); ?></td></tr>
<tr><th>Total:</th><td><?php echo $order->get_formatted_order_total(); ?></td></tr>
<?php if ( $dispute_reason ) : ?><tr><th>Reason:</th><td><?php echo esc_html( $dispute_reason ); ?></td></tr><?php endif; ?>
</table>
</div>

<div class="section">
<h2>Customer Information</h2>
<table>
<tr><th>Name:</th><td><?php echo esc_html( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() ); ?></td></tr>
<tr><th>Email:</th><td><?php echo esc_html( $order->get_billing_email() ); ?></td></tr>
<tr><th>Address:</th><td><?php $addr = $order->get_formatted_billing_address(); echo $addr ? esc_html( wp_strip_all_tags( $addr ) ) : 'N/A'; ?></td></tr>
<tr><th>IP Address:</th><td><?php echo esc_html( $order->get_customer_ip_address() ); ?></td></tr>
</table>
</div>

<div class="section">
<h2>Order Details</h2>
<table>
<thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
<tbody>
<?php foreach ( $order->get_items() as $item ) : $product = $item->get_product(); ?>
<tr>
<td><?php echo esc_html( $item->get_name() ); ?><?php if ( $product && WCM_Helpers::is_subscription_product( $product ) ) : ?> <strong>(Subscription)</strong><?php endif; ?></td>
<td><?php echo esc_html( $item->get_quantity() ); ?></td>
<td><?php echo wc_price( $item->get_subtotal() / max( 1, $item->get_quantity() ) ); ?></td>
<td><?php echo wc_price( $item->get_subtotal() ); ?></td>
</tr>
<?php endforeach; ?>
</tbody>
<tfoot><tr><th colspan="3" style="text-align:right">Total:</th><td><strong><?php echo $order->get_formatted_order_total(); ?></strong></td></tr></tfoot>
</table>
</div>

<?php if ( ! empty( $subscription_orders ) ) : ?>
<div class="section">
<h2>Subscription History (<?php echo count( $subscription_orders ); ?> orders)</h2>
<table>
<thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Amount</th></tr></thead>
<tbody>
<?php foreach ( $subscription_orders as $sub ) : ?>
<tr>
<td>#<?php echo esc_html( $sub->get_id() ); ?></td>
<td><?php echo $sub->get_date_created() ? esc_html( $sub->get_date_created()->date_i18n( get_option( 'date_format' ) ) ) : '—'; ?></td>
<td><?php echo esc_html( ucfirst( $sub->get_status() ) ); ?></td>
<td><?php echo $sub->get_formatted_order_total(); ?></td>
</tr>
<?php endforeach; ?>
</tbody>
</table>
<div class="highlight"><strong>Important:</strong> This demonstrates an established subscription relationship.</div>
</div>
<?php endif; ?>

<?php if ( ! empty( $acknowledgments ) ) : ?>
<div class="section">
<h2>Subscription Acknowledgment</h2>
<table>
<thead><tr><th>Date/Time</th><th>IP Address</th><th>Text Agreed To</th></tr></thead>
<tbody>
<?php foreach ( $acknowledgments as $ack ) : ?>
<tr>
<td><?php echo esc_html( date_i18n( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), strtotime( $ack['created_at'] ?? '' ) ) ); ?></td>
<td><?php echo esc_html( $ack['ip_address'] ?? '' ); ?></td>
<td><?php echo esc_html( $ack['acknowledgment_text'] ?? WCM_Helpers::get_acknowledgment_text() ); ?></td>
</tr>
<?php endforeach; ?>
</tbody>
</table>
<div class="highlight"><strong>Legal Note:</strong> Customer explicitly agreed to recurring charges before purchase.</div>
</div>
<?php endif; ?>

<div class="footer">
<p>Generated by WooCommerce Comprehensive Monitor</p>
<p><?php echo esc_url( get_site_url() ); ?> | <?php echo esc_html( $current_date ); ?></p>
</div>
</div>
</body>
</html>
        <?php
        return ob_get_clean();
    }

    private function generate_rebuttal_text( $order, $subscription_orders, $acknowledgments, $dispute_reason ) {
        $name = $order->get_billing_first_name() . ' ' . $order->get_billing_last_name();
        $date = $order->get_date_created() ? $order->get_date_created()->date_i18n( get_option( 'date_format' ) ) : 'unknown date';

        $text = "We dispute this chargeback. {$name} placed a legitimate order on {$date} (Order #{$order->get_id()}). ";

        if ( ! empty( $subscription_orders ) ) {
            $text .= 'This is part of an ongoing subscription relationship with ' . count( $subscription_orders ) . ' orders. ';
        }
        if ( ! empty( $acknowledgments ) ) {
            $text .= 'The customer explicitly acknowledged recurring payment terms during checkout. ';
        }
        if ( ! empty( $subscription_orders ) ) {
            $text .= 'No cancellation request was received prior to this charge. ';
        }
        $text .= 'All products were delivered as promised. Detailed evidence is attached.';

        return $text;
    }
}
