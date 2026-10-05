import type { FC } from 'react';
import { ArrowRight, Cloud, Database, HardDrive, KeyRound, Lock, ShieldCheck } from 'lucide-react';

const storageCards = [
  { icon: HardDrive, label: '刚拍下时', title: '照片先留在手机里', body: '你拍照或从相册选择照片后，照片先在手机上显示和编辑，还没有离开设备。', note: '这时还是你的原始照片。' },
  { icon: Lock, label: '上传前', title: '照片先在本地加密', body: '应用会生成缩略图、预览图和原图三个尺寸，并在离开设备前分别加密。', note: '上传的不是可以直接打开的照片。' },
  { icon: Cloud, label: '上传以后', title: '云端只保存加密文件', body: '加密后的照片文件放进腾讯云 COS 私有存储；服务器只负责授权、同步和记录文件位置。', note: '没有密码，云端不能还原照片。' },
] as const;

const flowSteps = [
  ['01', '拍照或选图', '照片先在你的手机里。'],
  ['02', '本地生成尺寸', '应用准备缩略图、预览图和原图。'],
  ['03', '本地加密', '三个尺寸分别加密后才离开手机。'],
  ['04', '上传到 COS', '加密文件进入私有存储，服务器只发放访问权限。'],
  ['05', '打开时解密', '设备下载密文，在本地解密后显示照片。'],
] as const;

export const SecuritySection: FC = () => (
  <section className="landing-section security-section" id="security">
    <div className="section-intro section-intro-narrow">
      <span className="section-kicker"><ShieldCheck size={14} /> 照片去哪了</span>
      <h2>照片上传以后，经历了什么？</h2>
      <p>从你拍下照片开始，我们把它变成加密文件，再放到云端。你下次打开时，照片会在自己的设备上恢复。</p>
    </div>

    <div className="security-storage-grid" aria-label="数据存储位置">
      {storageCards.map(({ icon: Icon, label, title, body, note }) => (
        <article className="security-storage-card" key={label}>
          <div className="security-flow-icon"><Icon size={20} /></div>
          <span className="security-storage-label">{label}</span>
          <h3>{title}</h3>
          <p>{body}</p>
          <strong>{note}</strong>
        </article>
      ))}
    </div>

    <div className="security-flow-rail" aria-label="照片从拍摄到再次打开的流程">
      {flowSteps.map(([index, title, body], stepIndex) => (
        <div className="security-flow-item" key={index}>
          <div className="security-flow-item-top"><span>{index}</span><Lock size={15} /></div>
          <h3>{title}</h3>
          <p>{body}</p>
          {stepIndex < flowSteps.length - 1 && <ArrowRight className="security-flow-arrow" size={18} aria-hidden="true" />}
        </div>
      ))}
    </div>

    <div className="security-encryption-note">
      <div className="security-encryption-icon"><KeyRound size={20} /></div>
      <div><strong>照片什么时候能被打开？</strong><p>只有在你的设备上输入私密空间密码后，应用才能解开照片。每个尺寸的照片都使用 AES-GCM 加密，并为每次加密生成新的随机 IV。</p></div>
      <Database className="security-encryption-db" size={22} aria-hidden="true" />
    </div>
  </section>
);

export default SecuritySection;
