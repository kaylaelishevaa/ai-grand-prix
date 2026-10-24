import {catalog,reviews} from '@/lib/catalog';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){return Response.json({offline:process.env.DEMO_OFFLINE==='1',configured:Boolean(process.env.OPENAI_API_KEY&&process.env.OPENAI_MODEL),model:process.env.OPENAI_MODEL||null,catalogCount:catalog.length,reviewCount:reviews.length},{headers:{'Cache-Control':'no-store'}});}
