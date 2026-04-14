const asciiCodes = {
  $: 0x24,
  "*": 0x2a,
  ":": 0x3a,
  "+": 0x2b,
  "-": 0x2d,
  "0": 0x30,
  "9": 0x39,
  A: 0x41,
  Z: 0x5a,
  "\r": 0x0d,
  "\n": 0x0a,
};

const decode = (data: Buffer) => {
  const command = data.toString().split("\r\n");
};

const encode = () => {};
