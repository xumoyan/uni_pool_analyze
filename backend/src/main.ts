import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>("app.port") || 3001;

  // 启用CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  await app.listen(port);
  console.log(`🚀 后端服务已启动，端口: ${port}`);
  console.log(`📊 流动性数据收集服务运行中...`);
}

bootstrap();
