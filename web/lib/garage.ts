type Photo = {title:string;image:string;author:string;source:string;license:string;terms?:string};
const commons = "https://commons.wikimedia.org/wiki/File:";
const cc4 = "https://creativecommons.org/licenses/by-sa/4.0/";
const cc0 = "https://creativecommons.org/publicdomain/zero/1.0/";
export const sampleGarage: Record<string,Photo> = {
  night:{title:"Nissan Skyline GT-R R34",image:"/garage/r34.webp",author:"Tokumeigakarinoaoshima",
    source:commons+"OSAKA_AUTO_MESSE_2015_(426)_-_Nissan_SKYLINE_GT-R_(BNR34)_tuned_by_AUTO_ACTIVE_GARAGE_ITO.JPG",license:"CC0 1.0",terms:cc0},
  arc:{title:"Toyota 86 Custom",image:"/garage/86.webp",author:"Firzafp",
    source:commons+"Toyota_86_(Modified)_in_Jakarta.JPG",license:"CC BY-SA 4.0",terms:cc4},
  flare:{title:"Subaru WRX STI VeilSide",image:"/garage/sti.webp",author:"Tokumeigakarinoaoshima",
    source:commons+"Subaru_WRX_STI_(CBA-GRB)_tuned_by_VeilSide_(2).jpg",license:"CC BY-SA 4.0",terms:cc4},
};
export const workshop: Photo[] = [
  {title:"Garrett GT30",image:"/garage/turbo.webp",author:"Freonr2",source:commons+"Turboexternalgate.jpg",license:"Public domain"},
  {title:"TRD wheel",image:"/garage/wheel.webp",author:"Tokumeigakarinoaoshima",
    source:commons+"The_tire_wheel_of_Toyota_86_(ZN6)_with_TRD_parts.JPG",license:"CC0 1.0",terms:cc0},
];
export const garagePhoto=(media:string)=>media.startsWith("sample:")?sampleGarage[media.slice(7)]:undefined;
export const frames = ["plain","gold","neon","carbon","nitro","chrome","flame"] as const;
export const frameTitles:Record<typeof frames[number],string> = {
  plain:"Default",neon:"Neon Circuit",carbon:"Carbon Weave",nitro:"Nitro Blue",chrome:"Chrome Lip",gold:"Gold Edition",flame:"Flame Spec",
};
