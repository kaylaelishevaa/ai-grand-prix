import PhoneDemo,{type PhoneDemoQuery} from '@/components/PhoneDemo';
import '@/components/phone-demo.css';
export default async function DemoPage({searchParams}:{searchParams:Promise<PhoneDemoQuery>}){return <PhoneDemo query={await searchParams}/>;}
