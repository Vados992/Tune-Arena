import TrophyPanel from '../trophy-panel';
export default async function Page({params}:{params:Promise<{code:string}>}){const {code}=await params;return <TrophyPanel code={code}/>;}
