import {readFileSync,writeFileSync} from 'node:fs';
import {demoCatalog} from '../lib/demo-catalog.mjs';
const root=new URL('../',import.meta.url);
const source=JSON.parse(readFileSync(new URL('data/catalog.json',root),'utf8'));
const products=demoCatalog(source);
const csv=value=>'"'+String(value??'').replaceAll('"','""')+'"';
const outputs=new Map([
 ['public/coupang-products.js','/* Preview-ready Coupang demo catalog. Generated from reviewed source records; reference prices are not live. */\nwindow.COUPANG_PRODUCTS = '+JSON.stringify(products,null,2)+';\n'],
 ['public/product-catalog.csv','\ufeff'+[['product_type','id','name','price_krw_reference','coupang_url','image'],...products.map(p=>[p.productType,p.id,p.name,p.price,p.url,p.image])].map(row=>row.map(csv).join(',')).join('\n')+'\n']
]);
for(const [name,contents] of outputs){const path=new URL(name,root);if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==contents)throw Error(`${name} is stale. Run npm run catalog:build.`);}else writeFileSync(path,contents);}
console.log(`${products.length} preview-ready demo products; ${source.length-products.length} source records held out.`);
