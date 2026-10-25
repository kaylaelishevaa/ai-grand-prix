import {CheckoutPage} from '@/components/CommercePages';
export default async function Page({searchParams}:{searchParams:Promise<{items?:string|string[]}>}){const query=await searchParams;const ids=typeof query.items==='string'?query.items.split(',').filter(id=>/^[a-zA-Z0-9_-]{1,100}$/.test(id)):[];return <CheckoutPage decisionIds={[...new Set(ids)].slice(0,30)}/>;}
