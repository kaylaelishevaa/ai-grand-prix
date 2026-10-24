export interface SampleAddress {id:string;label:string;line:string;postcode:string;area:string;dawnEligible:boolean;sample:true;}
export interface SamplePayment {id:string;label:string;last4:string;sample:true;}
export interface CategoryLicense {enabled:boolean;cap:number;}
export interface PermissionEntry {id:string;at:string;profileId:string;category:string;action:'enabled'|'revoked'|'cap changed';cap:number;}
export interface AccountState {
  id:string;version:1;members:{profileId:string;label:string}[];
  addresses:SampleAddress[];payments:SamplePayment[];defaultAddressId:string;defaultPaymentId:string;
  wowMember:boolean;householdBudget:number;notifications:{dailyLimit:number;quietHours:boolean};
  licenses:Record<string,Record<string,CategoryLicense>>;permissionLog:PermissionEntry[];updatedAt:string;
}
