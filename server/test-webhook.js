// Test script to pretend we are a frontend user getting an error
const axios = require('axios');

async function triggerFakeFrontendError() {
  console.log("Simulating a broken 'Add to Cart' button click...");
  try {
    const response = await axios.post("http://localhost:3000/api/track-woo-error", {
      site: "test-mystore.com",
      url: "https://test-mystore.com/checkout",
      type: "AJAX Checkout/Cart Failure",
      error_message: "Failed URL: ?wc-ajax=add_to_cart | Error: Internal Server Error",
      time: new Date().toISOString()
    });

    console.log("Success! The Node server received the error payload. Response:", response.data);
  } catch (error) {
    console.error("Test failed. Is the server running? Error:", error.message);
  }
}

triggerFakeFrontendError();