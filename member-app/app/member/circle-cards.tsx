import { circles } from "../../lib/circles";
import { CircleMark } from "./navigation";

export function CircleCards() {
  return (
    <ul className="member-circle-grid">
      {circles.map((circle) => (
        <li className={`member-circle tone-${circle.tone}`} key={circle.slug}>
          <span className="circle-mark">
            <CircleMark kind={circle.kind} />
          </span>
          <h3>{circle.title}</h3>
          <p>{circle.description}</p>
          <a href={`/member/circles/${circle.slug}`}>
            Explore preview <span className="sr-only">of {circle.title}</span>
            <span aria-hidden="true"> →</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
