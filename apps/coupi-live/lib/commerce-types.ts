import type {Profile} from './types';
import type {AccountState} from './account-types';

export type DeliveryKind='rocket'|'dawn'|'standard';
export type TrackingStep='preparing'|'packed'|'hub'|'out_for_delivery'|'delivered';
export interface CommerceAddress {id:string;label:string;line:string;postcode:string;area:string;dawnEligible:boolean;deliveryInstruction?:string;sample:true;}
export interface CommercePayment {id:string;label:string;last4:string;kind?:'wallet'|'card';sample:true;}
export interface DeliveryPromise {kind:DeliveryKind;label:string;promisedAt:string|null;basis:string;simulation:true;}
export interface DeliveryOption extends DeliveryPromise {available:boolean;unavailableReason:string|null;}
export interface OrderLine {origin?:'synthetic'|'coupang-reference';priceBasis?:'historical-reference';sourceUrl?:string;sourceNote?:string;checkedAt?:string;id:string;decisionId:string;skuId:string;name:string;category:string;quantity:1;catalogPrice:number;unitPrice:number;discount:number;total:number;deliveryFact:string;}
export interface CheckoutInput {decisionIds:string[];addressId:string;paymentMethodId:string;deliveryKind:DeliveryKind;deliveryInstruction:string;}
export interface CheckoutQuote {id:string;lines:OrderLine[];subtotal:number;discount:number;shippingFee:0;total:number;currency:'KRW';budgetRemaining:number;address:CommerceAddress;payment:CommercePayment;delivery:DeliveryPromise;deliveryOptions:DeliveryOption[];deliveryInstruction:string;simulation:true;}
export interface TrackingEvent {id:string;step:TrackingStep;label:string;at:string;simulation:true;}
export interface CompensationClaim {id:string;amount:3000;status:'pending'|'approved';reason:string;createdAt:string;approvedAt:string|null;simulation:true;}
export interface CommerceOrder {id:string;requestId:string;requestHash:string;createdAt:string;lines:OrderLine[];subtotal:number;discount:number;shippingFee:0;total:number;currency:'KRW';address:CommerceAddress;payment:CommercePayment;delivery:DeliveryPromise;deliveryInstruction:string;status:'preparing'|'shipping'|'delivered';stage:TrackingStep;timeline:TrackingEvent[];deliveredAt:string|null;doorstepPhoto:string|null;compensation:CompensationClaim|null;simulation:true;}
export type ReturnReason='damaged'|'wrong_item'|'not_as_expected'|'changed_mind'|'other';
export type ReturnEvidence={kind:'prepared';sampleId:'damaged-item'|'intact-item'}|{kind:'upload';fileName:string;mimeType:string;sizeBytes:number}|{kind:'none'};
export type ReturnOutcome='keep_refund'|'pickup_refund'|'human_review';
export interface ReturnInput {orderId:string;lineId:string;reason:ReturnReason;evidence:ReturnEvidence;}
export interface ReturnAssessment {id:string;orderId:string;lineId:string;skuId:string;itemName:string;outcome:ReturnOutcome;explanation:string;refundAmount:number;evidenceStatus:'prepared-simulation'|'not-inspected'|'none';pickup:{label:string;instruction:string;scheduledFor:string}|null;policyLabel:string;simulation:true;}
export interface CommerceReturn extends ReturnAssessment {id:string;assessmentId:string;requestId:string;createdAt:string;status:'refund_recorded'|'pickup_scheduled'|'human_review';evidence:ReturnEvidence;reason:ReturnReason;refundId:string|null;humanReview:{ticketId:string;status:'requested'|'resolved';message:string}|null;}
export interface RefundEntry {id:string;type:'return'|'compensation';orderId:string;returnId:string|null;amount:number;currency:'KRW';paymentLabel:string;createdAt:string;status:'recorded';simulation:true;}
export interface CommerceReceipt {requestId:string;action:string;hash:string;resultId:string;}
export interface CommerceState {version:1;orders:CommerceOrder[];returns:CommerceReturn[];refunds:RefundEntry[];receipts:CommerceReceipt[];}
export type CommerceAction=
 |({action:'quote'}&CheckoutInput)
 |({action:'checkout';requestId:string;quoteId:string}&CheckoutInput)
 |{action:'advanceTracking';orderId:string;requestId:string}
 |{action:'simulateDelay';orderId:string;requestId:string}
 |{action:'approveCompensation';orderId:string;requestId:string}
 |({action:'returnDecision'}&ReturnInput)
 |({action:'submitReturn';assessmentId:string;requestId:string}&ReturnInput)
 |{action:'completePickup';returnId:string;requestId:string}
 |{action:'humanReview';returnId:string;requestId:string};
export interface CommerceResponse {profile:Profile;commerce:CommerceState;account:AccountState;quote?:CheckoutQuote;order?:CommerceOrder;returnAssessment?:ReturnAssessment;returnRequest?:CommerceReturn;refund?:RefundEntry;}
