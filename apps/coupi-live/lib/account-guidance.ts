export type AccountSection='addresses'|'payments';
export interface AccountNavigation {href:'/account#addresses'|'/account#payments';label:string;section:AccountSection;}
export function accountNavigation(section:AccountSection):AccountNavigation {
  return section==='addresses'?{href:'/account#addresses',label:'Open my address book',section}:{href:'/account#payments',label:'Open payment methods',section};
}
/** Account details belong in the validated account form, never in shopping memory or an LLM prompt. */
export function accountRequest(text:string):AccountNavigation|null {
  const words=text.normalize('NFKC').toLowerCase();
  if(/\b(address|addresses|alamat|postcode|postal code|door instructions?)\b|배송지|주소|문 앞/.test(words))return accountNavigation('addresses');
  if(/\b(payment methods?|payment settings|my payments?|my card|credit card|debit card|coopy pay|coupi pay|pembayaran|kartu|bayar)\b|결제 수단|카드 설정/.test(words))return accountNavigation('payments');
  return null;
}
export function accountGuidance(navigation:AccountNavigation):string {
  return navigation.section==='addresses'?'Of course. Your address book is here—add or edit an address, then choose where things should arrive. I’ll use the address you confirm at checkout.':'Your payment methods are here. Choose Coopy Pay or a mock card; this simulation never asks for a real card number or makes a charge.';
}
