import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Typography,
  Card,
  Tabs,
  Alert,
  Space,
  Button,
  message,
  Collapse,
  Tag,
} from "antd";
import {
  CopyOutlined,
  CodeOutlined,
  ApiOutlined,
  RocketOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";

const { Title, Text, Paragraph } = Typography;

// CodeBlock component defined outside to avoid recreating on each render
function CodeBlock({ code, onCopy }) {
  return (
    <div style={{ position: "relative" }}>
      <pre
        style={{
          background: "#1e1e1e",
          padding: "16px",
          borderRadius: "8px",
          overflow: "auto",
          margin: 0,
        }}
      >
        <code
          style={{
            color: "#d4d4d4",
            fontFamily: "Monaco, Consolas, monospace",
            fontSize: "13px",
          }}
        >
          {code}
        </code>
      </pre>
      <Button
        type="text"
        icon={<CopyOutlined />}
        onClick={() => onCopy(code)}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          color: "#888",
        }}
      />
    </div>
  );
}

export default function Integration() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("claude-code");

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    message.success(t("common.copied"));
  };

  const baseUrl = window.location.origin;

  const claudeCodeContent = (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Alert message={t("integration.claudeCode.tip")} type="info" showIcon />

      <Card title={t("integration.claudeCode.jsonConfigTitle")} size="small">
        <Paragraph>{t("integration.claudeCode.jsonConfigDesc")}</Paragraph>
        <Paragraph type="secondary">
          {t("integration.claudeCode.jsonConfigPath")}
        </Paragraph>
        <CodeBlock
          code={`{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "your-api-key",
    "ANTHROPIC_BASE_URL": "${baseUrl}",
    "ANTHROPIC_MODEL": "claude-sonnet-4-20250514"
  }
}`}
          onCopy={copyToClipboard}
        />
      </Card>

      <Card
        title={t("integration.claudeCode.jsonConfigAdvancedTitle")}
        size="small"
      >
        <Paragraph>
          {t("integration.claudeCode.jsonConfigAdvancedDesc")}
        </Paragraph>
        <CodeBlock
          code={`{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "your-api-key",
    "ANTHROPIC_BASE_URL": "${baseUrl}",
    "ANTHROPIC_MODEL": "claude-opus-4-5",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-opus-4-5",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-opus-4-5",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-4-5",
    "ANTHROPIC_REASONING_MODEL": "claude-opus-4-5"
  }
}`}
          onCopy={copyToClipboard}
        />
      </Card>

      <Collapse
        items={[
          {
            key: "cli",
            label: t("integration.claudeCode.cliConfigTitle"),
            children: (
              <Space direction="vertical" style={{ width: "100%" }}>
                <Paragraph>
                  {t("integration.claudeCode.cliConfigDesc")}
                </Paragraph>
                <Card
                  title={t("integration.claudeCode.step1Title")}
                  size="small"
                >
                  <Paragraph>{t("integration.claudeCode.step1Desc")}</Paragraph>
                  <CodeBlock
                    code={`claude config set --global apiUrl ${baseUrl}`}
                    onCopy={copyToClipboard}
                  />
                </Card>
                <Card
                  title={t("integration.claudeCode.step2Title")}
                  size="small"
                >
                  <Paragraph>{t("integration.claudeCode.step2Desc")}</Paragraph>
                  <CodeBlock
                    code={`claude config set --global apiKey your-api-key`}
                    onCopy={copyToClipboard}
                  />
                </Card>
              </Space>
            ),
          },
          {
            key: "env",
            label: t("integration.claudeCode.envVarsTitle"),
            children: (
              <Space direction="vertical" style={{ width: "100%" }}>
                <Paragraph>{t("integration.claudeCode.envVarsDesc")}</Paragraph>
                <CodeBlock
                  code={`export ANTHROPIC_BASE_URL="${baseUrl}"
export ANTHROPIC_AUTH_TOKEN="your-api-key"`}
                  onCopy={copyToClipboard}
                />
              </Space>
            ),
          },
        ]}
      />
    </Space>
  );

  const openaiContent = (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Alert message={t("integration.openai.tip")} type="info" showIcon />

      <Card title={t("integration.openai.endpointTitle")} size="small">
        <Space direction="vertical" style={{ width: "100%" }}>
          <div>
            <Tag color="green">POST</Tag>
            <Text code>{baseUrl}/v1/chat/completions</Text>
          </div>
          <div>
            <Tag color="blue">GET</Tag>
            <Text code>{baseUrl}/v1/models</Text>
          </div>
        </Space>
      </Card>

      <Card title={t("integration.openai.curlTitle")} size="small">
        <CodeBlock
          code={`curl ${baseUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -d '{
    "model": "kiro",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "stream": true
  }'`}
          onCopy={copyToClipboard}
        />
      </Card>

      <Card title={t("integration.openai.pythonTitle")} size="small">
        <CodeBlock
          code={`from openai import OpenAI

client = OpenAI(
    api_key="sk-your-api-key",
    base_url="${baseUrl}/v1"
)

response = client.chat.completions.create(
    model="kiro",
    messages=[
        {"role": "user", "content": "Hello!"}
    ],
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")`}
          onCopy={copyToClipboard}
        />
      </Card>

      <Card title={t("integration.openai.nodeTitle")} size="small">
        <CodeBlock
          code={`import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'sk-your-api-key',
  baseURL: '${baseUrl}/v1',
});

const stream = await client.chat.completions.create({
  model: 'kiro',
  messages: [{ role: 'user', content: 'Hello!' }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}`}
          onCopy={copyToClipboard}
        />
      </Card>
    </Space>
  );

  const claudeContent = (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Alert message={t("integration.claude.tip")} type="info" showIcon />

      <Card title={t("integration.claude.endpointTitle")} size="small">
        <Space direction="vertical" style={{ width: "100%" }}>
          <div>
            <Tag color="green">POST</Tag>
            <Text code>{baseUrl}/v1/messages</Text>
          </div>
        </Space>
      </Card>

      <Card title={t("integration.claude.curlTitle")} size="small">
        <CodeBlock
          code={`curl ${baseUrl}/v1/messages \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: sk-your-api-key" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello!"}
    ],
    "stream": true
  }'`}
          onCopy={copyToClipboard}
        />
      </Card>

      <Card title={t("integration.claude.pythonTitle")} size="small">
        <CodeBlock
          code={`import anthropic

client = anthropic.Anthropic(
    api_key="sk-your-api-key",
    base_url="${baseUrl}"
)

with client.messages.stream(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
) as stream:
    for text in stream.text_stream:
        print(text, end="")`}
          onCopy={copyToClipboard}
        />
      </Card>

      <Card title={t("integration.claude.nodeTitle")} size="small">
        <CodeBlock
          code={`import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: 'sk-your-api-key',
  baseURL: '${baseUrl}',
});

const stream = await client.messages.stream({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }],
});

for await (const event of stream) {
  if (event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta') {
    process.stdout.write(event.delta.text);
  }
}`}
          onCopy={copyToClipboard}
        />
      </Card>
    </Space>
  );

  const otherToolsContent = (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card title={t("integration.other.cursorTitle")} size="small">
        <Paragraph>{t("integration.other.cursorDesc")}</Paragraph>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Text strong>{t("integration.other.cursorSteps")}</Text>
          <ol style={{ paddingLeft: 20, margin: "8px 0" }}>
            <li>{t("integration.other.cursorStep1")}</li>
            <li>{t("integration.other.cursorStep2")}</li>
            <li>{t("integration.other.cursorStep3")}</li>
          </ol>
          <CodeBlock
            code={`Base URL: ${baseUrl}/v1
API Key: sk-your-api-key`}
            onCopy={copyToClipboard}
          />
        </Space>
      </Card>

      <Card title={t("integration.other.continueTitle")} size="small">
        <Paragraph>{t("integration.other.continueDesc")}</Paragraph>
        <CodeBlock
          code={`{
  "models": [
    {
      "title": "OctoProxy",
      "provider": "openai",
      "model": "kiro",
      "apiBase": "${baseUrl}/v1",
      "apiKey": "sk-your-api-key"
    }
  ]
}`}
          onCopy={copyToClipboard}
        />
      </Card>

      <Card title={t("integration.other.aiderTitle")} size="small">
        <Paragraph>{t("integration.other.aiderDesc")}</Paragraph>
        <CodeBlock
          code={`export OPENAI_API_BASE="${baseUrl}/v1"
export OPENAI_API_KEY="sk-your-api-key"

aider --model openai/kiro`}
          onCopy={copyToClipboard}
        />
      </Card>

      <Card title={t("integration.other.lobechatTitle")} size="small">
        <Paragraph>{t("integration.other.lobechatDesc")}</Paragraph>
        <CodeBlock
          code={`API Endpoint: ${baseUrl}/v1
API Key: sk-your-api-key
Model: kiro`}
          onCopy={copyToClipboard}
        />
      </Card>
    </Space>
  );

  const tabItems = [
    {
      key: "claude-code",
      label: (
        <span>
          <RocketOutlined /> Claude Code
        </span>
      ),
      children: claudeCodeContent,
    },
    {
      key: "openai",
      label: (
        <span>
          <ApiOutlined /> OpenAI API
        </span>
      ),
      children: openaiContent,
    },
    {
      key: "claude",
      label: (
        <span>
          <CodeOutlined /> Claude API
        </span>
      ),
      children: claudeContent,
    },
    {
      key: "other",
      label: (
        <span>
          <CheckCircleOutlined /> {t("integration.other.title")}
        </span>
      ),
      children: otherToolsContent,
    },
  ];

  return (
    <div>
      <Title level={2}>{t("integration.title")}</Title>
      <Paragraph type="secondary" style={{ marginBottom: 24 }}>
        {t("integration.description")}
      </Paragraph>

      <Card>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          size="large"
        />
      </Card>
    </div>
  );
}
