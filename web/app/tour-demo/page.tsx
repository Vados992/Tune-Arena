import {headers} from 'next/headers';
import {detectLanguage} from '@/lib/locale';
import TourDemo from './tour-demo';
export const dynamic='force-dynamic';
export const metadata={title:'Tune Arena · Test rounds',robots:{index:false,follow:false}};
export default async function Page(){
  const h=await headers();
  return <TourDemo initialLanguage={detectLanguage(h.get('cf-ipcountry'),h.get('accept-language'))} epoch={Math.floor(Date.now()/1000)}/>;
}
