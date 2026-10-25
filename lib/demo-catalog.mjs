/* The demo exposes only records with a reviewed, supported live-preview recipe.
 * Keep the complete source catalog separately for evidence and later asset repair.
 * Browser catalog generation and the server use this same eligibility contract.
 */
const KINDS = {makeup:'lip',clothes:'garment',desk:'object',glasses:'glasses'};
const TYPES = {lipstick:'lip',lipbalm:'lip',tshirt:'garment',hoodie:'garment',sweater:'garment',chair:'object',lamp:'object',glasses:'glasses'};
const LOCAL_IMAGE = /^\/products\/[a-z0-9][a-z0-9._-]*\.(?:png|jpe?g|webp)$/i;
const LIP_COLOR = /^#[a-f0-9]{6}$/i;

export function isDemoProduct(product) {
  const preview=product?.preview;
  if(!preview||preview.available===false||KINDS[product.category]!==preview.kind||TYPES[product.productType]!==preview.kind)return false;
  if(!LOCAL_IMAGE.test(preview.image||product.image||''))return false;
  if(preview.kind==='lip'&&preview.finish!=='clear-balm'&&!LIP_COLOR.test(preview.color||''))return false;
  if(preview.crop!==undefined){
    const c=preview.crop;
    if(!c||typeof c!=='object'||Array.isArray(c)||['x','y','width','height'].some(k=>typeof c[k]!=='number'||!Number.isFinite(c[k])||c[k]<0||c[k]>1)||!c.width||!c.height||c.x+c.width>1||c.y+c.height>1)return false;
  }
  return true;
}

export function demoCatalog(value) {
  const products=Array.isArray(value)?value:Array.isArray(value?.products)?value.products:[];
  return products.filter(isDemoProduct);
}
