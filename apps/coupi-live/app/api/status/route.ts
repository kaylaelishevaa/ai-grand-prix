import {catalog,reviews} from '@/lib/catalog';
import {runtimeEnv} from '@/lib/server/runtime';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){const env=runtimeEnv();return Response.json({offline:env.DEMO_OFFLINE==='1',configured:Boolean(env.OPENAI_API_KEY&&env.OPENAI_MODEL),model:env.OPENAI_MODEL||null,catalogCount:catalog.length,reviewCount:reviews.length},{headers:{'Cache-Control':'no-store'}});}
