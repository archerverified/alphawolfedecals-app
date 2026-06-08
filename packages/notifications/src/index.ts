// @alphawolf/notifications — order email templates + dispatch (Goal 3c).
export * from './types.js';
export { firstNameOf, orderNumberFromId } from './format.js';
export { renderOrderEmail } from './templates.js';
export {
  dispatchOrderEmail,
  notifyOrderSubmitted,
  notifyOrderReceived,
  notifyOrderInProduction,
  notifyOrderFulfilled,
} from './dispatch.js';
