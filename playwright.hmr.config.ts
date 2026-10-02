import {defineConfig} from "@playwright/test";
export default defineConfig({testDir:"tests/hmr",workers:1,use:{baseURL:"http://127.0.0.1:5180"},webServer:{command:"node tests/hmr-server.mjs",url:"http://127.0.0.1:5180",reuseExistingServer:false},reporter:"list"});

