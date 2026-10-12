// Captured from proxy.finance.qq.com getBoardRankList (count=6) on 2026-10-12 during the A股 lunch break;
// each entry trimmed to code, name and zdf. Keyed by board code, then `down` (gainers) or `up` (losers).
export const MOVERS_BODIES: Readonly<Record<string, { down: string; up: string }>> = {
  pt02003891: {
    down:
      '{"code":0,"msg":"ok","data":{"rank_list":[{"code":"sz002692","name":"远程股份","zdf":"10.08"},{"code":"sz002990","name":"盛视科技","zdf":"10.01"},{"code":"sh603232","name":"格尔软件","zdf":"10.01"},{"code":"sh601929","name":"吉视传媒","zdf":"10.00"},{"code":"sh603528","name":"多伦科技","zdf":"9.98"},{"code":"sh603155","name":"新亚强","zdf":"9.98"}],"total":645}}',
    up:
      '{"code":0,"msg":"ok","data":{"rank_list":[{"code":"sh605303","name":"园林股份","zdf":"-10.00"},{"code":"sz000056","name":"*ST皇庭","zdf":"-10.00"},{"code":"sh603002","name":"宏昌电子","zdf":"-9.45"},{"code":"sh600141","name":"兴发集团","zdf":"-8.97"},{"code":"sh603186","name":"华正新材","zdf":"-8.46"},{"code":"sh600605","name":"汇通能源","zdf":"-6.67"}],"total":645}}',
  },
  pt02003800: {
    down:
      '{"code":0,"msg":"ok","data":{"rank_list":[{"code":"sz301052","name":"果麦文化","zdf":"20.01"},{"code":"sz300781","name":"因赛集团","zdf":"13.55"},{"code":"sh600831","name":"广电网络","zdf":"10.14"},{"code":"sz002990","name":"盛视科技","zdf":"10.01"},{"code":"sh603232","name":"格尔软件","zdf":"10.01"},{"code":"sh605287","name":"德才股份","zdf":"10.00"}],"total":892}}',
    up:
      '{"code":0,"msg":"ok","data":{"rank_list":[{"code":"sz002717","name":"*ST岭南","zdf":"-10.00"},{"code":"sh601872","name":"招商轮船","zdf":"-9.79"},{"code":"sz002396","name":"星网锐捷","zdf":"-9.22"},{"code":"sz001389","name":"广合科技","zdf":"-8.15"},{"code":"sz300911","name":"亿田智能","zdf":"-8.12"},{"code":"sz300162","name":"雷曼光电","zdf":"-6.84"}],"total":892}}',
  },
  pt02003640: {
    down:
      '{"code":0,"msg":"ok","data":{"rank_list":[{"code":"sz301419","name":"阿莱德","zdf":"20.00"},{"code":"sz301310","name":"鑫宏业","zdf":"13.48"},{"code":"sz300690","name":"双一科技","zdf":"12.47"},{"code":"sz002441","name":"众业达","zdf":"10.04"},{"code":"sz002990","name":"盛视科技","zdf":"10.01"},{"code":"sh600560","name":"金自天正","zdf":"10.01"}],"total":1005}}',
    up:
      '{"code":0,"msg":"ok","data":{"rank_list":[{"code":"sz002838","name":"道恩股份","zdf":"-9.45"},{"code":"sz002396","name":"星网锐捷","zdf":"-9.22"},{"code":"sh600141","name":"兴发集团","zdf":"-8.97"},{"code":"sz002182","name":"宝武镁业","zdf":"-8.37"},{"code":"sz001389","name":"广合科技","zdf":"-8.15"},{"code":"sz301046","name":"能辉科技","zdf":"-7.89"}],"total":1005}}',
  },
  pt02003711: {
    down:
      '{"code":0,"msg":"ok","data":{"rank_list":[{"code":"sh600621","name":"华鑫股份","zdf":"3.52"},{"code":"sh601211","name":"国泰海通","zdf":"1.78"},{"code":"sz002736","name":"国信证券","zdf":"1.42"},{"code":"sh600918","name":"中泰证券","zdf":"1.28"},{"code":"sh600061","name":"国投资本","zdf":"1.13"},{"code":"sh600517","name":"国网英大","zdf":"0.80"}],"total":53}}',
    up:
      '{"code":0,"msg":"ok","data":{"rank_list":[{"code":"sh600095","name":"湘财股份","zdf":"-2.13"},{"code":"sz000712","name":"锦龙股份","zdf":"-1.90"},{"code":"sz300803","name":"指南针","zdf":"-1.69"},{"code":"sh600909","name":"华安证券","zdf":"-1.44"},{"code":"sz002670","name":"国盛证券","zdf":"-1.08"},{"code":"sh601108","name":"财通证券","zdf":"-0.74"}],"total":53}}',
  },
  pt02131362: {
    down:
      '{"code":0,"msg":"ok","data":{"rank_list":[{"code":"sz300006","name":"莱美药业","zdf":"19.93"},{"code":"sh600812","name":"华北制药","zdf":"9.95"},{"code":"sz002082","name":"ST万邦","zdf":"7.00"},{"code":"sh603980","name":"吉华集团","zdf":"5.18"},{"code":"sh603336","name":"宏辉果蔬","zdf":"5.05"},{"code":"sz301333","name":"诺思格","zdf":"4.95"}],"total":214}}',
    up:
      '{"code":0,"msg":"ok","data":{"rank_list":[{"code":"sh600664","name":"哈药股份","zdf":"-10.01"},{"code":"sz002349","name":"精华制药","zdf":"-6.39"},{"code":"sh600721","name":"百花医药","zdf":"-6.11"},{"code":"sh603439","name":"三力制药","zdf":"-5.98"},{"code":"sz300534","name":"陇神戎发","zdf":"-5.19"},{"code":"sz002437","name":"誉衡药业","zdf":"-5.15"}],"total":214}}',
  },
}
