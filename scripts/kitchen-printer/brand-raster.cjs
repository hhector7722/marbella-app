'use strict'
// Logo original en mapa de bits ESC/POS monocromo.
// La variante sin título conserva únicamente el logotipo de la izquierda.
const { gunzipSync } = require('node:zlib')
const DATA = {'COMANDA': 'H4sIAAAAAAAC/+3ZT0vcQBQA8IkR00NxPPawuwPtFxA8uOLSobd+DKFgr0JBtlg68dSjn6f0MosHj36BopFCvbmRHjay6UzfzCabYDJb3DdQC+aw/jn8SObNe/Pytnu4Sd6SQ/J0/Y+Xjr0wQmsfTKS1Tj04FBzlwQl0wnysEIWHEomHZYZ7iTL8Y+XmE79AkY0VRy8Qk3aRJNbh9jNE76B89gO70EFxI5+QTljsnB42XMUCU2y4Sg8Z+Nfl8yEDX65vgMywebxTL2EnZIhz5o/Tx22f+fJ2cNtnHu51XDGc/7bmyYlQTpVWIcoZVJFDJUYV7QCVGLXdh3IOPDm1rNrDOIkfp14tNjGO9OPUq+AGxqltvhePwKmfEs8wTq18NR2WQ7MmH+q0NbIx1Wmg40gRmhGe0JRr2ClCNstP9zjZcDaOWjKdwS1RcHLCU+PkbV3gOmHXv1ytRggO12rmsNKBzk23OtPU3VhL6NHBYeAowjPjQGvbbLfXSS89ks7Gmkn9Q5u+GJC5I4M2pzOZOp0sHGmij+dODs5pq9MD55vLYSkZKSKOdWoQPXOkSAKdNR02dj4XS0gAzsg6AhxlHJaGTadj1tnl8ISEECVwBDiicqYtTvf0q9ORhZNZJ+baOBScvOks6ojrjualk0V3yzjsSuW/FVEc9uQJOFEW3Sqcc7nA6cxOn6i/wNF3KlAMnHPr0NTlDBc7ApycJfy8cBLd4pgT/ij80h8udELrjK3DWh3zP3FyvZOHjnhdKX4LDk34WemINmf1TSwuJzvK5YysY3L0TNu4MynipkP59Xj6fdLvha79rOCWoIaYHLX70NaORp6K7b39j633U+aXYoVjMg3yot2ZbL37Cc7uTejK98LJao5s1J/ueGt/X1xc716Ervqj6EhR40ht64Zoczp6+/2NiZdacdXDwsmtc2prbdJ0Prx8tbodne3crLjqs4JlYkkIjrDPpM3KudpeQlZc58U9J/6Ls+Y6v2ZOYDLVnjvajjLunacLnPI8NQ6XpZPD3w904JiAw6twTOUwMYcbK2YQjn5j1VP/8/wxONJPH1XvVzF9Xb1/xjjEUx9ef79AOQee3lOGnpyBp/evgaf3yp6n91zamiJLOLGfOUBVOHBziSpRcXOSKsFwc5sqMXBzpGpDH+CcgZ8523wjYud+1NMcstxAFDkXLe8DO+8tB5EDpFMORtFfPHy+Nx9d9mJ2gSOJdWhSaajAZ9XToQJmXgxC/Pc7dsrAErzDNHSUMd6BtlTnxMPV0p8vudIZebqern94/QH6fC7yOCEAAA==', 'KITCHEN ORDER': 'H4sIAAAAAAAC/+3ZQUscMRQA4JmOOD0U47GH1YH2DwgeVFwaeuvPEAr2KhTEYjFTevDY31N6meKhf6LYFKF7cwM9GDCd9CXZmWQ32674ArXgCLqi+zHJS957k1073MheZIfZ/fU/XrpOwjCtUzCl1lokcAg4bQIn17xKMUMEBsV4gmmGeyklfljKfMdPUGljRdETVDV2khqsQ+33Ar2ClPuBneh8ciNvkU4xWTnr2HBNJphgw9V5yMA/68aHDHw3vzlyh/XxFknCnmVHOKcfzjZu+fTTO8Atnz7cK7hk2L9aTuSUKMdvqwLlDH3kUBvDRztHbYxg9aGcg0ROsKv2MA5P44TZYgPjNGmcMAuuYpxg8T2+A05YJR5inCB9zXHYTNKu1A0c/9+cSA1do8p1S0Sh4GXRZqanhca2gp6U6QZeCqq5Tz9r7/hq5FTCOtDJdo42Tq51XWkFjnSO9Mm0Gv2UkUO5dciMU2jTkmpwlHPa0LkWkcMa61SBU2vbaQvn6MhZF8dN5MC7jEMVm3JIS41Tg1NbR3tncHUdOd/NKKCFpZxYR8CIGnhPJYiEP9bs1LL0TPv0PLj6FDkXrXNYU0w7vJQw6JrV9lfaBE41jsc1UhOnznqHO0c5h/JpZ2DmOXLG0jl6xqFN8Udn7exj5MBSc07mHTHlVJEzr0WDdbrIETdyGu/Y5dgWWto35q0JJquJgCVJz9oFTh05v3pHe0cHzsBVn3J7gaN6R3lHzjhHM048LuUd6R0ROKbCHxen20fz57lz2kX3Y+acfRjtqOJvcVcnLl7gtM6BX7UKnaXnNft2tdMGjowd1sX9wsyzi/uXcJ4JHY2vv15tr3tnrKL1rGi/fqxj1+HnNtinbGtv/830/YzaaH9BLur2l+73xeep/b758gc4u5feudDRfu8cOX9/rWRr4839fXY+2j0vgvxTz+YfCNok/3Da9HmD1T6P6a1XlyZe7YMgHzbOmeTDzrH50DiTPDblvH7ydGmr/LJzGTiMW8fn5/dQOyb5GYqAy6sSnCaLn94ChwrrkBnH1gv4cnkeHDrPWQ7ql7ROGThFV7+guLm6Yxw+p/kOHKKs4+upc2w95US4OghOtcApW+tkTPZOrl19N0Xb1WXjiDn9xlKi/ufRXXCaNH1U2K9i+rqwf8Y4WaI+PHy+QDkHiZ5TjhI5w0TPX8NEz5XriZ5zydwtcgunTnMO4BMH7lzCb1TcOYnfYLhzG78xcOdIfkEf4JxhmnO2fiFiz/1IonPIbgER5Llodx/Y897uIHKIPQ+Xac7Ds5OZ89FbH0DX4XE2IvDca6jASz86VMBMY1PgP9+xnzVVHO9Ah12k+PwLulCtsgQXtLFNCifXMru/7q9/eP0G3+AfEjghAAA='}
function brandRaster(title) {
  const data = DATA[title || 'COMANDA']
  if (!data) throw new Error('Título de cabecera desconocido')
  const raster = gunzipSync(Buffer.from(data, 'base64'))
  if (title) return raster
  // El logotipo ocupa menos de 128 píxeles en la trama original de 576 píxeles.
  const stride = raster[4] + (raster[5] << 8)
  const height = raster[6] + (raster[7] << 8)
  for (let y = 0; y < height; y++) {
    raster.fill(0, 8 + y * stride + 16, 8 + (y + 1) * stride)
  }
  return raster
}
module.exports = { brandRaster }