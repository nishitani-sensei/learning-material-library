export type Audience = 'student' | 'teacher';
export interface ToolUpdate {
  date: string;
  kind: 'added' | 'feature';
  summary: string;
}
export interface Tool {
  id: string; title: string; description: string; audience: Audience; category: string;
  grades: number[]; tags: string[]; kind: string; entry: string; thumbnail: string;
  updated: string; instructions: string[]; sample: boolean;
  updates?: ToolUpdate[];
}
export const subjects = [
  {id:'japanese',name:'国語',reading:'こくご',icon:'あ',color:'rose'},
  {id:'math',name:'算数',reading:'さんすう',icon:'＋',color:'sage'},
  {id:'science',name:'理科',reading:'りか',icon:'♧',color:'mint'},
  {id:'social',name:'社会',reading:'しゃかい',icon:'◎',color:'sand'},
  {id:'life',name:'生活',reading:'せいかつ',icon:'☀',color:'peach'},
  {id:'english',name:'外国語',reading:'がいこくご',icon:'A',color:'blue'},
  {id:'music',name:'音楽',reading:'おんがく',icon:'♪',color:'lilac'},
  {id:'pe',name:'体育',reading:'たいいく',icon:'↗',color:'aqua'},
  {id:'art',name:'図画工作',reading:'ずがこうさく',icon:'✎',color:'peach'},
  {id:'home',name:'家庭',reading:'かてい',icon:'⌂',color:'rose'},
  {id:'moral',name:'道徳',reading:'どうとく',icon:'♡',color:'lilac'},
  {id:'integrated',name:'総合',reading:'そうごう',icon:'✦',color:'mint'},
  {id:'activities',name:'特別活動',reading:'とくべつかつどう',icon:'☺',color:'sand'}
];
export const workCategories = [
  {id:'lesson',name:'授業準備',icon:'✎'}, {id:'classroom',name:'学級づくり',icon:'⌂'},
  {id:'school',name:'行事・校務',icon:'⚑'}, {id:'documents',name:'文書・印刷',icon:'▤'}
];
export const categoryName = (id:string) => [...subjects,...workCategories].find(c=>c.id===id)?.name ?? id;
export const normalize = (s:string) => s.normalize('NFKC').toLocaleLowerCase('ja').trim();
export function visibleTools(tools:Tool[], teacher:boolean) {return tools.filter(t=>teacher || t.audience==='student');}
export function recentUpdates(tools: Tool[]) {
  return tools.flatMap(tool => (tool.updates ?? []).map(update => ({tool, update})))
    .sort((a, b) => b.update.date.localeCompare(a.update.date) || a.tool.id.localeCompare(b.tool.id))
    .slice(0, 6);
}
export function filterTools(tools:Tool[], filters:{query:string;category:string;grade:string;kind:string}) {
  const words = normalize(filters.query).split(/\s+/).filter(Boolean);
  return tools.filter(t=> (!filters.category || t.category===filters.category) &&
    (!filters.grade || subjects.some(subject=>subject.id===t.category) && (t.grades.length===0 || t.grades.includes(Number(filters.grade)))) &&
    (!filters.kind || t.kind===filters.kind) &&
    words.every(w=>normalize([t.title,t.description,categoryName(t.category),...t.tags].join(' ')).includes(w)));
}
export function readIds(value:string|null):string[] {try {const a=JSON.parse(value??'[]');return Array.isArray(a)?[...new Set(a.filter(x=>typeof x==='string'))].slice(0,50):[];}catch{return [];}}
export function readRecent(value:string|null):string[] {return readIds(value);}
export function escapeHtml(value:unknown):string {return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export function safeAsset(value:string):boolean {return typeof value==='string' && value.length>0 && !value.startsWith('/') && !value.includes('\\') && !value.split('/').some(p=>p==='..'||p==='.') && !/[:?#\u0000-\u0020]/.test(value);}
export function parseCatalog(value:unknown,audience:Audience):Tool[] {
  if(!Array.isArray(value))throw new Error('INVALID_CATALOG');
  const seen=new Set<string>();
  for(const t of value){
    if(!t||typeof t!=='object'||typeof t.id!=='string'||!/^[a-z0-9][a-z0-9-]*$/.test(t.id)||seen.has(t.id)||t.audience!==audience||
      typeof t.title!=='string'||typeof t.description!=='string'||typeof t.category!=='string'||!safeAsset(t.entry)||!t.entry.startsWith(`tools/${t.id}/`)||
      !safeAsset(t.thumbnail)||!Array.isArray(t.grades)||!t.grades.every((g:unknown)=>Number.isInteger(g)&&Number(g)>=1&&Number(g)<=6)||
      !Array.isArray(t.tags)||!t.tags.every((s:unknown)=>typeof s==='string')||!Array.isArray(t.instructions)||!t.instructions.every((s:unknown)=>typeof s==='string')||
      typeof t.kind!=='string'||typeof t.updated!=='string'||typeof t.sample!=='boolean')throw new Error('INVALID_CATALOG');
    if(t.updates!==undefined && (!Array.isArray(t.updates)||t.updates.some((update:Partial<ToolUpdate>|null)=>
      !update || (update.kind!=='added' && update.kind!=='feature') ||
      typeof update.date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(update.date) || typeof update.summary!=='string'))){
      throw new Error('INVALID_CATALOG');
    }
    seen.add(t.id);
  }
  return value as Tool[];
}
