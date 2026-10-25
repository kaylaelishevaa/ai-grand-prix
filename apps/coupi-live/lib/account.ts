import type {AccountState,CategoryLicense} from './account-types';
import {AppError} from './server/errors';
import {catalog} from './catalog';
export const permissionCategories=[...new Set(catalog.filter(sku=>!sku.sensitive).map(sku=>sku.category))].filter(category=>category!=='personal-care');
export function assertAccountMember(account:AccountState,profileId:string){if(!account.members.some(member=>member.profileId===profileId))throw new AppError('ACCOUNT_MEMBER_MISMATCH','This profile does not belong to the current demo household.',403);}
export function categoryLicense(account:AccountState,profileId:string,category:string):CategoryLicense {assertAccountMember(account,profileId);return account.licenses[profileId]?.[category]||{enabled:false,cap:0};}
export function accountForCheckout(account:AccountState,profileId:string){assertAccountMember(account,profileId);return {addresses:account.addresses,payments:account.payments,wowMember:account.wowMember,householdBudget:account.householdBudget,defaultAddressId:account.defaultAddressId,defaultPaymentId:account.defaultPaymentId};}
