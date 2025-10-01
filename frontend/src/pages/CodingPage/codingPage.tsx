import { useParams } from "react-router-dom";

export default function CodingPage() {
  const { projectName } = useParams<{ projectName: string }>();

  if (!projectName) {
    return <div>No project selected.</div>;
  }

  const name = decodeURIComponent(projectName);
  return (
    <div>
      <h1>CODING PAGE</h1>
      <p>Current project: <b>{name}</b></p>
      {/* 在这里根据 name 去加载该项目的数据 */}
    </div>
  );
}
