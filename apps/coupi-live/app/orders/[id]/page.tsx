import {OrderPage} from '@/components/CommercePages';
export default async function Page({params}:{params:Promise<{id:string}>}){return <OrderPage orderId={(await params).id}/>;}
