import { BenchmarksClient } from "@/components/dashboard/benchmarks/BenchmarksClient";

export const metadata = {
	title: "Substrate benchmarks",
	description:
		"Compare boot, resume, exec, compute, and I/O across every substrate provider.",
};

export default function BenchmarksPage() {
	return <BenchmarksClient />;
}
