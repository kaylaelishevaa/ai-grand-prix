import type {NextConfig} from 'next';
const config:NextConfig={
  poweredByHeader:false,
  devIndicators:false,
  async redirects(){return [
    {source:'/settings',destination:'/account',permanent:false},
    {source:'/setting',destination:'/account',permanent:false},
    {source:'/camera',destination:'/call',permanent:false},
    {source:'/camera.html',destination:'/call',permanent:false},
    {source:'/index.html',destination:'/',permanent:false},
  ];},
  async headers(){return [{source:'/api/:path*',headers:[{key:'Cache-Control',value:'no-store'},{key:'X-Content-Type-Options',value:'nosniff'}]}];}
};
export default config;
