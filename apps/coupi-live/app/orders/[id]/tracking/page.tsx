import {TrackingPage} from '@/components/CommercePages';
export default async function Page({params}:{params:Promise<{id:string}>}){return <TrackingPage orderId={(await params).id}/>;}
