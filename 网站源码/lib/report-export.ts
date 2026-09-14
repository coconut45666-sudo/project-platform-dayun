import {planGallery,galleryImages} from './report-layout';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { runs } from './reports';
const esc = (v: any) => String(v ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
function run(x: any) { const text = String(x.text || '').split('\n').map(esc).join('</w:t><w:br/><w:t xml:space="preserve">'), size = (Number(x.size) || 14) * 2; return `<w:r><w:rPr><w:rFonts w:ascii="${esc(x.font || '仿宋')}" w:hAnsi="${esc(x.font || '仿宋')}" w:eastAsia="${esc(x.font || '仿宋')}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:b w:val="${x.bold ? 1 : 0}"/><w:i w:val="${x.italic ? 1 : 0}"/><w:u w:val="${x.underline ? 'single' : 'none'}"/><w:color w:val="${/^[a-f0-9]{6}$/i.test(x.color) ? x.color : '000000'}"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`; }
function para(value: any, opts: any = {}) { return `<w:p><w:pPr><w:spacing w:before="${opts.before || 0}" w:after="${opts.after ?? 120}" w:line="360" w:lineRule="auto"/>${opts.center ? '<w:jc w:val="center"/>' : ''}${opts.heading ? '<w:keepNext/>' : ''}${opts.indent ? '<w:ind w:firstLine="560"/>' : ''}</w:pPr>${Array.isArray(value) ? value.map(run).join('') : run({ text: value, size: opts.size || 14, bold: opts.bold })}</w:p>`; }
function cell(content: string, width: number, header = false) { return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${header ? '<w:shd w:fill="D9EAF7"/>' : ''}<w:vAlign w:val="center"/></w:tcPr>${(content || para('')).replaceAll('w:line="360"', 'w:line="324"')}</w:tc>`; }
function table(rows: string[][], widths: number[], heading = true) { return `<w:tbl><w:tblPr><w:tblStyle w:val="a8"/><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.map((r, i) => `<w:tr><w:trPr>${i === 0 && heading ? '<w:tblHeader/>' : ''}<w:cantSplit/></w:trPr>${r.map((c, j) => cell(c, widths[j], i === 0 && heading)).join('')}</w:tr>`).join('')}</w:tbl>${para('', { after: 40 })}`; }
export async function makeDocx(r: any, status: string, loadAsset: (path: string) => Promise<Uint8Array>, imageInfo?: (bytes: Uint8Array) => Promise<{
    bytes: Uint8Array;
    width: number;
    height: number;
    ext: string;
}>) {
    const original = await loadAsset('/api/assets/report-template.docx'), zip = unzipSync(original), doc = strFromU8(zip['word/document.xml']);
    const sects = doc.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g), sect = sects?.at(-1) || '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1440" w:left="1800"/></w:sectPr>';
    let rels = strFromU8(zip['word/_rels/document.xml.rels']), types = strFromU8(zip['[Content_Types].xml']), imageCount = 0;
    async function gallery(path:string,maxWidth=415){const images=galleryImages(r,path),infos:Record<string,any>={};for(const im of images){if(!imageInfo)throw Error('此导出环境缺少图片处理能力。');infos[im.id]=await imageInfo(await loadAsset('/api/files/'+im.id));}const rows=planGallery(r,path,maxWidth,infos);let output='';const page=()=>'<w:p><w:r><w:br w:type="page"/></w:r></w:p>';let previousBreak=false;for(const row of rows){if(row.breakBefore&&!previousBreak)output+=page();const unit=(maxWidth-row.gapPt*(row.columns-1))/row.columns;const grid:number[]=[];for(let i=0;i<row.columns;i++){grid.push(Math.round(unit*20));if(i<row.columns-1)grid.push(Math.round(row.gapPt*20));}let cells='',used=0;for(const item of row.items){while(used<item.column*2){cells+='<w:tc><w:tcPr><w:tcW w:w="'+grid[used]+'" w:type="dxa"/></w:tcPr><w:p/></w:tc>';used++;}const info=infos[item.id],id=1000+(++imageCount),rel='rIdDayun'+id,name='dayun-'+id+'.'+info.ext,cx=Math.round(item.widthPt*12700),cy=Math.round(item.heightPt*12700);zip['word/media/'+name]=info.bytes;rels=rels.replace('</Relationships>','<Relationship Id="'+rel+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/'+name+'"/></Relationships>');if(!types.includes('Extension="'+info.ext+'"'))types=types.replace('</Types>','<Default Extension="'+info.ext+'" ContentType="image/'+(info.ext==='jpg'?'jpeg':'png')+'"/></Types>');const count=item.span*2-1;let content='<w:p><w:pPr><w:jc w:val="'+item.align+'"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>'+(item.caption?'<w:keepNext/>':'')+'</w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="'+cx+'" cy="'+cy+'"/><wp:docPr id="'+id+'" name="'+esc(item.caption||name)+'"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="'+id+'" name="'+esc(name)+'"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="'+rel+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';if(item.caption)content+=para(item.caption,{size:10,after:40}).replace('<w:pPr>','<w:pPr><w:jc w:val="'+item.align+'"/>');cells+='<w:tc><w:tcPr><w:tcW w:w="'+Math.round(item.cellWidthPt*20)+'" w:type="dxa"/><w:gridSpan w:val="'+count+'"/><w:vAlign w:val="top"/></w:tcPr>'+content+'</w:tc>';used+=count;}while(used<grid.length){cells+='<w:tc><w:tcPr><w:tcW w:w="'+grid[used]+'" w:type="dxa"/></w:tcPr><w:p/></w:tc>';used++;}output+='<w:tbl><w:tblPr><w:tblW w:w="'+Math.round(maxWidth*20)+'" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>'+['top','left','bottom','right','insideH','insideV'].map(k=>'<w:'+k+' w:val="nil"/>').join('')+'</w:tblBorders><w:tblCellMar>'+['top','left','bottom','right'].map(k=>'<w:'+k+' w:w="0" w:type="dxa"/>').join('')+'</w:tblCellMar></w:tblPr><w:tblGrid>'+grid.map(w=>'<w:gridCol w:w="'+w+'"/>').join('')+'</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>'+cells+'</w:tr></w:tbl>'+para('',{after:40,size:1});if(row.breakAfter)output+=page();previousBreak=row.breakAfter;}return output;}
    const rich = (key: string) => para(runs(r, key), { heading: key.startsWith('heading.'), indent: !key.startsWith('heading.') });
    let body = para(r.project, { center: true, size: 18, bold: true }) + para(r.title, { center: true, size: 18, bold: true }) + para('编号：' + r.number + (status === 'published' ? '' : '　草稿 · 待复核'), { size: 11 });
    body += table([[para('工作日期', { size: 12 }), para(r.date, { size: 12 }), para('天气', { size: 12 }), para(r.weather || '—', { size: 12 })], [para('顾问专家', { size: 12 }), para(r.experts || '—', { size: 12 }), para('施工任务', { size: 12 }), para(r.slots.task || '—', { size: 12 })]], [1163, 2243, 1329, 3571], false);
    body += rich('heading.demolition') + rich('heading.demolition_overview') + rich('demolition.overview') + rich('demolition.focus') + await gallery('demolition.images');
    if (r.demolition.issuesEnabled) {
        body += rich('heading.issues');
        const rows = [[para('序号', { size: 12 }), para('现场图片', { size: 12 }), para('顾问关注事项', { size: 12 })]];
        for (let i = 0; i < r.demolition.issues.length; i++) {
            const x = r.demolition.issues[i];
            rows.push([para(i + 1, { size: 12 }), await gallery('demolition.issues.'+x.id+'.photos',175), para(x.advice || '—', { size: 12 })]);
        }
        if (rows.length === 1)
            rows.push([para('—'), para('—'), para('本项未填写', { size: 12 })]);
        body += table(rows, [660, 3620, 4026]);
    }
    body += rich('demolition.conclusion') + rich('heading.drainage') + rich('heading.drainage_overview') + rich('drainage.overview') + await gallery('drainage.images') + rich('heading.drainage_safety');
    body += table([[para('序号', { size: 12 }), para('现场安全事项', { size: 12 }), para('顾问关注事项', { size: 12 })], ...r.drainage.items.map((x: any, i: number) => [para(i + 1, { size: 12 }), para(x.item, { size: 12 }), para(x.advice || '—', { size: 12 })])], [660, 2870, 4776]);
    body += rich('drainage.conclusion') + await gallery('drainage.monitoring') + rich('heading.plans');
    body += table([[para('序号', { size: 12 }), para('计划事项', { size: 12 })], ...(r.plans.length ? r.plans.map((x: any, i: number) => [para(i + 1, { size: 12 }), para(x.text, { size: 12 })]) : [[para('—'), para('本项未填写', { size: 12 })]])], [660, 7646]);
    body += para('编制：' + (r.signatures.authors || '—')) + para('复核：' + (r.signatures.reviewers || '—')) + para('批准：' + (r.signatures.approver || '—'));
    zip['word/document.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w:body>${body}${sect}</w:body></w:document>`);
    zip['word/_rels/document.xml.rels'] = strToU8(rels);
    zip['[Content_Types].xml'] = strToU8(types);
    if (zip['word/settings.xml']) {
        let s = strFromU8(zip['word/settings.xml']);
        s = s.replace(/<w:updateFields[^>]*\/>/g, '');
        zip['word/settings.xml'] = strToU8(s.replace('</w:settings>', '<w:updateFields w:val="true"/></w:settings>'));
    }
    return zipSync(zip, { level: 6 });
}
export async function exportDocx(r: any, status: string) { const bytes = await makeDocx(r, status, async (path) => { const resp = await fetch(path, { credentials: 'same-origin' }); if (!resp.ok)
    throw Error('无法读取日报模板或图片，请重试。'); return new Uint8Array(await resp.arrayBuffer()); }, async (bytes) => { const blob = new Blob([bytes as BlobPart]); const bitmap = await createImageBitmap(blob); const info = { width: bitmap.width, height: bitmap.height }; if (bytes[0] === 137) {
    bitmap.close();
    return { ...info, bytes, ext: 'png' };
} if (bytes[0] === 255) {
    bitmap.close();
    return { ...info, bytes, ext: 'jpg' };
} const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height; canvas.getContext('2d')!.drawImage(bitmap, 0, 0); bitmap.close(); const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('图片转换失败')), 'image/png')); return { ...info, bytes: new Uint8Array(await png.arrayBuffer()), ext: 'png' }; }); const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })); const a = document.createElement('a'); a.href = url; a.download = r.number + (status === 'published' ? '' : '-草稿') + '.docx'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
