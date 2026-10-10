// Captured from web.ifzq.gtimg.cn on 2026-10-09 after the A股 close; the minute list is trimmed to its first 5 and last 2 points.
export const MINUTE_BODY =
  '{"code":0,"msg":"","data":{"sh000001":{"data":{"data":["0930 3804.09 3600224 5970630812.60","0931 3806.44 22565813 34188124032.50","0932 3800.08 31862621 50042541135.50","0933 3797.44 40480691 63644705727.10","0934 3795.28 47693636 75662656693.60","1459 3815.63 529619632 880926305505.50","1500 3813.79 535149921 888561198263.90"],"date":"20261009"}}}}'

// The same endpoint asked for a code it does not know.
export const MINUTE_UNKNOWN_BODY = '{"code":0,"msg":"","data":{"sh999999":{"data":{"data":["  0"],"date":""}}}}'
