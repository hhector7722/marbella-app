import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validateMobileCategories,visibleIds,unassignedIds,searchableIds,UNASSIGNED,type MobileCategory,type MobileCatalogProduct} from './bdp-mobile-catalog.ts'
const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002',c='10000000-0000-4000-8000-000000000003'
const products:MobileCatalogProduct[]=[1,2,3,4,5].map(id=>({id,nombre:'PLU '+id,precio_base:id,departamento_id:1}))
const cats:MobileCategory[]=[
 {id:a,parentId:null,sourceId:null,name:'A',hidden:false,products:[2,1]},
 {id:b,parentId:a,sourceId:null,name:'B',hidden:false,products:[3,2]},
 {id:c,parentId:null,sourceId:null,name:'C',hidden:true,products:[4,2]},
]
test('orden, duplicados entre categorías y filtro por subcategoría',()=>{
 assert.deepEqual(visibleIds(cats,products,a,null),[2,1,3])
 assert.deepEqual(visibleIds(cats,products,a,b),[3,2])
 assert.deepEqual(visibleIds(cats,products,c,null),[])
 assert.deepEqual(unassignedIds(cats,products),[5])
 assert.deepEqual(visibleIds(cats,products,UNASSIGNED,null),[5])
 assert.deepEqual([...searchableIds(products)],[1,2,3,4,5])
})
test('validación de identidad y jerarquía, sin copiar precios',()=>{
 const known=new Set(products.map(p=>p.id))
 assert.deepEqual(validateMobileCategories(cats,known),cats)
 assert.throws(()=>validateMobileCategories([...cats,{...cats[0]}],known))
 assert.throws(()=>validateMobileCategories([{...cats[0],parentId:b}],known))
 assert.throws(()=>validateMobileCategories([{...cats[0],products:[99]}],known))
 const safe=validateMobileCategories([{...cats[0],price:0,products:[2,2,1]}],known)
 assert.deepEqual(safe,[cats[0]])
})
