# Vieser, verkkouudistuksen demot

Pitch-demot Vieserin verkkouudistukseen: tyylilaatta (brändi verkossa), puhdistusohje mobiilissa ja vierityskertomuksena sekä tuotesivun konsepti.

- Sivut ovat Claude Design -canvaksen artboardeja (`*.dc.html`) sellaisenaan.
- `support.js` ajaa ne selaimessa: `{{ }}`-reiät, `sc-for`, `sc-if`, `dc-import`, `ref`, `componentDidMount` ja komponenttien tila.
- Kuvat ovat kansiossa `img/`, nimettynä canvaksen kuvatunnisteen mukaan.
- Päivitys canvakselta: `python3 tools/sync-from-canvas.py <canvaksen project-kansio> <canvaksen kuvakansio>`, sitten commit ja push.

Julkaisupeili, noindex. Lattiatason huonekuva on AI-konseptikuva. Räjäytyskuvan mitoista osa on tulkittu.
