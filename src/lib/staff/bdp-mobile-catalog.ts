export type MobileCategory = {
  id:string
  parentId:string|null
  sourceId:string|null
  name:string
  hidden:boolean
  products:number[]
}
export type MobileCategoryDisplay = MobileCategory & {coverPhotoUrl?:string|null;coverPhotoScale?:string|null}
export type MobileCatalogProduct = {
  id:number;nombre:string;display_name?:string|null;precio_base:number;departamento_id:number|null
  photo_url?:string|null;carta_photo_scale?:string|null;category_parent_name?:string|null
  sort_order?:number|null;medio_price?:number|null
}
export type MobileCatalog = {revision:number;categories:MobileCategoryDisplay[];products:MobileCatalogProduct[]}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const UNASSIGNED='unassigned'
export function validateMobileCategories(value:unknown,known:ReadonlySet<number>):MobileCategory[] {
  if(!Array.isArray(value)||value.length>200)throw Error('Categorías inválidas')
  const ids=new Set<string>()
  const rows:MobileCategory[]=value.map(raw=>{
    if(!raw||typeof raw!=='object'||typeof raw.id!=='string'||!uuid.test(raw.id)||ids.has(raw.id)||typeof raw.name!=='string'||!raw.name.trim()||raw.name.trim().length>100||typeof raw.hidden!=='boolean'||!(raw.parentId===null||(typeof raw.parentId==='string'&&uuid.test(raw.parentId)))||!(raw.sourceId===null||(typeof raw.sourceId==='string'&&uuid.test(raw.sourceId)))||!Array.isArray(raw.products)||raw.products.length>2000||raw.products.some((id:unknown)=>typeof id!=='number'||!Number.isSafeInteger(id)||!known.has(id)))throw Error('Categoría o artículo inválido')
    ids.add(raw.id)
    return {id:raw.id,parentId:raw.parentId,sourceId:raw.sourceId,name:raw.name.trim(),hidden:raw.hidden,products:[...new Set<number>(raw.products)]}
  })
  for(const row of rows){
    if(row.parentId!==null&&!rows.some(parent=>parent.id===row.parentId&&parent.parentId===null))throw Error('Subcategoría sin categoría principal')
  }
  return rows
}
export function unassignedIds(categories:MobileCategory[],products:MobileCatalogProduct[]):number[]{
  const assigned=new Set(categories.flatMap(c=>c.products))
  return products.filter(p=>!assigned.has(p.id)).map(p=>p.id)
}
export function visibleIds(categories:MobileCategory[],products:MobileCatalogProduct[],category:string,child:string|null):number[]{
  if(category===UNASSIGNED)return unassignedIds(categories,products)
  const root=categories.find(c=>c.id===category&&c.parentId===null&&!c.hidden)
  if(!root)return []
  const children=categories.filter(c=>c.parentId===root.id&&!c.hidden)
  return [...new Set(child?children.find(c=>c.id===child)?.products??[]:[...root.products,...children.flatMap(c=>c.products)])]
}
// Ocultar una categoría solo afecta a la navegación, no al catálogo BDP.
export function searchableIds(products:MobileCatalogProduct[]):Set<number>{
  return new Set(products.map(p=>p.id))
}
