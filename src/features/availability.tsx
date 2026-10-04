import { Link } from "react-router-dom";
import { useEvent } from "../app/event";
import { useI18n } from "../i18n/provider";
import { StayBoard } from "./stay-board";
export default function Availability() {
  const { event } = useEvent(),
    { t } = useI18n();
  return (
    <section>
      <div className="page-heading">
        <h1>{t("availability")}</h1>
        <Link className="button" to={"/e/" + event.id + "/apartment"}>
          {t("apartments")}
        </Link>
      </div>
      <StayBoard />
    </section>
  );
}
