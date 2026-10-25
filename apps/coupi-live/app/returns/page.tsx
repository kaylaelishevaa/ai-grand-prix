import {ReturnsPage} from '@/components/CommercePages';
export default async function Page({searchParams}:{searchParams:Promise<{order?:string|string[]}>}){const query=await searchParams;return <ReturnsPage initialOrderId={typeof query.order==='string'?query.order:''}/>;}
