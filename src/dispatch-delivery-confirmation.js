function isWhatsAppSendConfirmed(result) {
  return Number(result?.ack) > 0;
}

module.exports = { isWhatsAppSendConfirmed };
