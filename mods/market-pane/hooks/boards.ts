/**
 * The A股 boards the pane watches, in display order. qt.gtimg.cn quotes board
 * codes like stocks; the names it returns are GBK, so each board's name lives here.
 */
export const BOARDS: readonly { code: string; name: string }[] = [
  { code: 'pt02003891', name: '半导体' }, // 芯片概念
  { code: 'pt02003800', name: '人工智能' },
  { code: 'pt02003640', name: '机器人' }, // 机器人概念
  { code: 'pt02003711', name: '券商' }, // 券商概念
  { code: 'pt02131362', name: '创新药' },
]
